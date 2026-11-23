import { createHash } from 'node:crypto'
import path from 'node:path'
import { load } from 'cheerio'
import type { BookRecord, OnlineBookPreview, OnlineCatalog, OnlineDiscovery, OnlineChapter, OnlineChapterLink, OnlineSourceId } from '../shared/types'
import { ONLINE_SOURCES, onlineBookUrl, onlineSource, onlineUrl } from '../shared/online'
import { ReadexStorage, readJson, writeJsonAtomic } from './storage'

export type OnlineFetch = (url: string, options?: { body?: string; referer?: string }) => Promise<string>
const hash = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 20)
const clean = (value: string): string => value.replace(/\s+/g, ' ').trim()
const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function parseOnlineBooks(html: string, pageUrl: string): OnlineBookPreview[] {
  const $ = load(html)
  const found = new Map<string, OnlineBookPreview>()
  $('a[href]').each((_, el) => {
    const a = $(el)
    const href = a.attr('href') ?? ''
    if (!/^(?:https?:\/\/[^/]+)?\/(?:read\/\d+\/?|book\/\d+\.html)$/.test(href)) return
    let url: string
    try { url = onlineBookUrl(onlineUrl(href, pageUrl).href) } catch { return }
    const title = clean(a.attr('title') ?? a.text()).replace(/[《》]/g, '')
    if (!title || title.length > 100 || /^(?:首页|目錄|目录|立即阅读|开始阅读|返回|最新章节)/.test(title)) return
    if (found.has(url)) return
    const parent = a.closest('li, .item, .bookbox, .novelslist2, tr')
    const author = clean(parent.find('.bauthor, .s3, .author').first().text()).replace(/^作者[：: ]+/, '')
    const description = clean(parent.find('.intro, .description, .desc, p').first().text()).slice(0, 240)
    found.set(url, { source: onlineSource(url), url, title, author, description })
  })
  return [...found.values()].slice(0, 80)
}

export function parseOnlineMetadata(html: string, url: string): OnlineBookPreview {
  const $ = load(html)
  const meta = (name: string): string => clean($(`meta[property="${name}"]`).attr('content') ?? '')
  const title = meta('og:novel:book_name') || meta('og:title') || clean($('h1').first().text())
  if (!title || /Loading|Forbidden|验证|驗證|Just a moment/i.test(title)) {
    throw new Error('网站未返回书籍信息，请稍后重试或在浏览器打开原站')
  }
  return { source: onlineSource(url), url: onlineBookUrl(url), title, author: meta('og:novel:author'), description: meta('og:description').slice(0, 1000) }
}

export function parseOnlineToc(html: string, bookUrl: string): OnlineChapterLink[] {
  const $ = load(html)
  const bid = /\/(\d+)(?:\.html|\/)$/.exec(onlineBookUrl(bookUrl))![1]
  const source = onlineSource(bookUrl)
  const pattern = source === 'ixdzs'
    ? new RegExp(`^/read/${bid}/p(\\d+)\\.html$`)
    : new RegExp(`^/book/${bid}/(\\d+)(?:_\\d+)?\\.html$`)
  const chapters = new Map<string, OnlineChapterLink>()
  $('a[href]').each((_, el) => {
    const a = $(el)
    let url: URL
    try { url = onlineUrl(a.attr('href') ?? '', bookUrl) } catch { return }
    if (onlineSource(url.href) !== source || !pattern.test(url.pathname)) return
    const label = clean(a.text())
    if (!label || /^(?:上一|下一|返回|开始|立即|目錄|目录)/.test(label)) return
    url.search = ''
    if (!chapters.has(url.href)) chapters.set(url.href, { id: `online-${hash(url.href)}`, label, url: url.href })
  })
  // Numeric page IDs reflect source order, including duplicate chapter numbers.
  return [...chapters.values()].sort((a, b) => {
    const page = (url: string): number => Number(pattern.exec(new URL(url).pathname)?.[1] ?? 0)
    return page(a.url) - page(b.url)
  })
}

export function parseOnlineChapter(html: string, chapter: OnlineChapterLink): OnlineChapter & { nextPage?: string } {
  const $ = load(html)
  const root = $('#chaptercontent, article.page-content section, #content, .read-content').first().clone()
  if (!root.length) throw new Error('未找到章节正文，网站可能暂时不可用，请重试或打开原站')
  root.find('script, style, iframe, form, button, nav, ins, .ads, .ad, [id^="compass"], [class*="pubadx"], [class*="adsby"], [style*="display:none"], [style*="display: none"]').remove()
  root.find('br').replaceWith('\n')
  root.find('p, div').each((_, el) => { $(el).append('\n') })
  const paragraphs = root.text().split(/\n+/).map((p) => p.replace(/\u00a0/g, ' ').trim()).filter(Boolean)
    .filter((p) => !/^(?:请收藏|請收藏|本章未完|点击下一页|點擊下一頁|（本章完）|\(本章完\))/.test(p))
  const text = paragraphs.join('\n\n')
  if (text.length < 12) throw new Error('章节正文为空，请稍后重试')
  let nextPage: string | undefined
  $('a[href]').each((_, el) => {
    const a = $(el)
    if (!/^(?:下一[页頁]|下[一]?页|下[一]?頁)/.test(clean(a.text()))) return
    try {
      const url = onlineUrl(a.attr('href') ?? '', chapter.url)
      const base = new URL(chapter.url)
      // A split page must belong to the exact same chapter; never follow next-chapter links here.
      if (url.origin === base.origin && url.pathname.replace(/_\d+(?=\.html$)/, '') === base.pathname.replace(/_\d+(?=\.html$)/, '') && url.href !== chapter.url) nextPage = url.href
    } catch { /* Ignore non-provider links. */ }
  })
  return { id: chapter.id, label: chapter.label, url: chapter.url, cached: false, text, html: `<h1>${escape(chapter.label)}</h1>${paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}`, nextPage }
}

export class OnlineLibrary {
  private pending = new Map<string, Promise<OnlineChapter>>()
  constructor(private storage: ReadexStorage, private fetchHtml: OnlineFetch) {}

  async discover(source: OnlineSourceId, query = ''): Promise<OnlineDiscovery> {
    const provider = ONLINE_SOURCES.find((s) => s.id === source)
    if (!provider) throw new Error('不支持的书源')
    if (typeof query !== 'string' || query.length > 200) throw new Error('搜索内容过长')
    const url = new URL(query.trim() ? (source === 'biquge' ? '/search/' : '/bsearch') : '/', provider.url)
    if (query.trim()) url.searchParams.set(source === 'biquge' ? 'searchkey' : 'q', query.trim())
    const html = await this.fetchHtml(url.href)
    const books = parseOnlineBooks(html, url.href)
    // Some providers redirect a unique search result straight to its detail page.
    if (!books.length && /og:novel:book_name/.test(html)) {
      const $ = load(html)
      const target = $('meta[property="og:novel:read_url"]').attr('content')
      if (target) return { books: [parseOnlineMetadata(html, onlineUrl(target, provider.url).href)] }
    }
    if (!books.length && /Forbidden|验证码|驗證碼|Just a moment|<title>Loading/i.test(html)) throw new Error('网站暂时无法访问，请稍后重试或在浏览器打开原站')
    if (!books.length && query.trim() && source === 'biquge') {
      const recommended = parseOnlineBooks(await this.fetchHtml(provider.url), provider.url)
      const keyword = query.trim().toLocaleLowerCase()
      const matches = recommended.filter((book) => `${book.title} ${book.author}`.toLocaleLowerCase().includes(keyword))
      return { books: matches, notice: matches.length ? '原站搜索未返回结果，以下是首页推荐中匹配的书籍。其他书籍可粘贴链接打开。' : '原站搜索未返回匹配结果，请粘贴书籍链接打开，或在浏览器查看原站。' }
    }
    return { books }
  }

  async catalog(input: string): Promise<OnlineCatalog> {
    const url = onlineBookUrl(input)
    const book = parseOnlineMetadata(await this.fetchHtml(url), url)
    const bid = /\/(\d+)(?:\.html|\/)$/.exec(url)![1]
    // Fetch the complete directory, rather than the abbreviated/latest list in the detail page.
    const html = book.source === 'ixdzs'
      ? await this.fetchHtml(new URL('/novel/html', url).href, { body: new URLSearchParams({ bid }).toString(), referer: url })
      : await this.fetchHtml(new URL(`/book/${bid}/`, url).href)
    const chapters = parseOnlineToc(html, url)
    if (!chapters.length) throw new Error('没有读取到完整目录，请稍后重试')
    return { book, chapters, updatedAt: new Date().toISOString() }
  }

  async add(url: string): Promise<BookRecord> {
    const canonical = onlineBookUrl(url)
    const id = `online-${hash(canonical)}`
    const catalog = await this.catalog(canonical)
    const existing = await this.storage.getBookRecord(id)
    const now = new Date().toISOString()
    const book: BookRecord = { ...catalog.book, id, format: 'txt', fileName: catalog.book.title, originalPath: canonical, importedAt: existing?.importedAt ?? now, updatedAt: now, size: 0, sha256: hash(canonical), progress: existing?.progress ?? 0, lastLocation: existing?.lastLocation, chapterCount: catalog.chapters.length, online: { source: catalog.book.source, url: canonical } }
    await writeJsonAtomic(this.catalogPath(id), catalog)
    await this.storage.addBook(book)
    return book
  }

  private catalogPath(id: string): string { return path.join(this.storage.getBookDirectory(id), 'online-catalog.json') }

  async getCatalog(bookId: string, refresh = false): Promise<OnlineCatalog> {
    const book = await this.storage.getBookRecord(bookId)
    if (!book?.online) throw new Error('在线书籍不存在或已被移除')
    const cached = await readJson<OnlineCatalog | null>(this.catalogPath(book.id), null)
    if (cached && !refresh) return cached
    const catalog = await this.catalog(book.online.url)
    await writeJsonAtomic(this.catalogPath(book.id), catalog)
    await this.storage.updateBook(book.id, { chapterCount: catalog.chapters.length })
    return catalog
  }

  async chapter(bookId: string, chapterId: string): Promise<OnlineChapter> {
    const catalog = await this.getCatalog(bookId)
    const chapter = catalog.chapters.find((c) => c.id === chapterId)
    if (!chapter) throw new Error('所选章节不在目录中，请刷新目录')
    const key = `${bookId}:${chapterId}`
    if (this.pending.has(key)) return this.pending.get(key)!
    const promise = this.loadChapter(bookId, chapter)
    this.pending.set(key, promise)
    try { return await promise } finally { this.pending.delete(key) }
  }

  private async loadChapter(bookId: string, chapter: OnlineChapterLink): Promise<OnlineChapter> {
    const file = path.join(this.storage.getPaths().parseCache, bookId, 'online', `${chapter.id}.json`)
    const cached = await readJson<OnlineChapter | null>(file, null)
    if (cached) return { ...cached, cached: true }
    let page = chapter.url
    const seen = new Set<string>()
    const texts: string[] = []
    let done = false
    for (let i = 0; i < 20; i++) {
      if (seen.has(page)) throw new Error('网站分页出现循环，请稍后重试')
      seen.add(page)
      const result = parseOnlineChapter(await this.fetchHtml(page), { ...chapter, url: page })
      texts.push(result.text)
      if (!result.nextPage) { done = true; break }
      page = result.nextPage
    }
    if (!done) throw new Error('章节分页过多，暂时无法完整加载')
    const text = texts.join('\n\n')
    const result: OnlineChapter = { ...chapter, text, html: `<h1>${escape(chapter.label)}</h1>${text.split(/\n\n/).map((p) => `<p>${escape(p)}</p>`).join('')}`, cached: false }
    await writeJsonAtomic(file, result)
    return result
  }
}
