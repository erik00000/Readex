import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { OnlineLibrary, parseOnlineBooks, parseOnlineChapter, parseOnlineMetadata, parseOnlineToc } from '../../src/main/online'
import { onlineBookUrl, onlineUrl } from '../../src/shared/online'
import type { BookRecord } from '../../src/shared/types'
import { ReadexStorage } from '../../src/main/storage'

const biquge = 'https://www.biquge.tw/book/123.html'
const ixdzs = 'https://ixdzs8.com/read/456/'
const metadata = '<meta property="og:novel:book_name" content="测试小说"><meta property="og:novel:author" content="测试作者">'
const toc = '<li><a href="/read/456/p3.html">第三章</a></li><li><a href="/read/456/p1.html">第一章</a></li><li><a href="/read/456/p2.html">第一章（同号续篇）</a></li>'
const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true }) })

async function library(fetcher: (url: string, options?: { body?: string; referer?: string }) => Promise<string>): Promise<OnlineLibrary> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'readex-online-test-'))
  dirs.push(root)
  const books = new Map<string, BookRecord>()
  const storage = {
    getPaths: () => ({ parseCache: path.join(root, 'cache') }),
    getBookDirectory: (id: string) => path.join(root, 'books', id),
    getBookRecord: async (id: string) => books.get(id) ?? null,
    addBook: async (book: BookRecord) => { books.set(book.id, book) },
    updateBook: async (id: string, patch: Partial<BookRecord>) => { const book = books.get(id)!; books.set(id, { ...book, ...patch }); return books.get(id) }
  } as unknown as ReadexStorage
  return new OnlineLibrary(storage, fetcher)
}

describe('online source parsing', () => {
  it('canonicalizes provider detail, directory and chapter URLs without accepting other hosts', () => {
    expect(onlineBookUrl('http://m.biquge.tw/book/123/77.html?x=1#here')).toBe(biquge)
    expect(onlineBookUrl('https://www.ixdzs8.com/read/456/p3.html')).toBe(ixdzs)
    for (const value of ['https://ixdzs8.com.evil.test/read/456/', 'https://user:pass@ixdzs8.com/read/456/', 'file:///etc/passwd', 'https://127.0.0.1/', 'https://ixdzs8.com:8443/']) expect(() => onlineUrl(value)).toThrow()
    expect(() => onlineBookUrl('https://ixdzs8.com/author/123')).toThrow()
  })

  it('extracts unique books while excluding navigation and chapter links', () => {
    const books = parseOnlineBooks('<li><a href="/read/456/"><img></a><h3><a href="/read/456/">测试小说</a></h3><span class="bauthor">作者甲</span></li><a href="/read/456/p1.html">第一章</a><a href="https://evil.test/read/999/">外站</a>', ixdzs)
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({ title: '测试小说', author: '作者甲', url: ixdzs })
    expect(parseOnlineMetadata(metadata, biquge).title).toBe('测试小说')
  })

  it('keeps same-number chapters distinct and orders source page IDs, not visible chapter numbers', () => {
    const chapters = parseOnlineToc(toc + '<a href="/read/456/p1.html">重复链接</a><a href="/read/999/p1.html">其他书籍</a>', ixdzs)
    expect(chapters.map((c) => c.label)).toEqual(['第一章', '第一章（同号续篇）', '第三章'])
    expect(new Set(chapters.map((c) => c.id)).size).toBe(3)
    expect(parseOnlineToc('<a href="/book/123/70.html">0001开始</a><a href="/book/123/80.html">0002结束</a>', biquge)).toHaveLength(2)
  })

  it('takes only body paragraphs and returns escaped HTML, excluding scripts, metadata and adverts', () => {
    const chapter = { id: 'test', label: '<img src=x onerror=alert(1)>', url: `${ixdzs}p1.html` }
    const result = parseOnlineChapter('<article class="page-content"><h2>重复标题</h2><div class="chapter-meta">作者信息</div><section><p>测试正文内容，应该正常显示。</p><script>alert(1)</script><p>&lt;img src=x&gt; &amp; 正文</p></section><div class="cf-feed-box">广告</div></article>', chapter)
    expect(result.text).toContain('测试正文内容')
    expect(result.text).not.toMatch(/作者信息|重复标题|广告|alert/)
    expect(result.html).toContain('&lt;img')
    expect(result.html).not.toContain('<img')
  })

  it('follows split pages only within the same chapter', () => {
    const result = parseOnlineChapter('<div id="chaptercontent"><p>这是测试正文，内容长度足够。</p></div><a href="/book/123/70_2.html">下一页</a><a href="/book/123/80.html">下一章</a>', { id: 'c1', label: '第一章', url: 'https://www.biquge.tw/book/123/70.html' })
    expect(result.nextPage).toBe('https://www.biquge.tw/book/123/70_2.html')
    const other = parseOnlineChapter('<div id="content">这是测试正文，内容长度足够。</div><a href="https://evil.test/book/123/70_2.html">下一页</a>', { id: 'c1', label: '第一章', url: 'https://www.biquge.tw/book/123/70.html' })
    expect(other.nextPage).toBeUndefined()
  })
})

describe('online chapter service', () => {
  it('labels the homepage fallback when the provider search returns no matches', async () => {
    const service = await library(async (url) => url.includes('/search/') ? '<div>找不到</div>' : '<li><a href="/book/123.html">测试小说</a></li>')
    const result = await service.discover('biquge', '测试')
    expect(result.books).toHaveLength(1)
    expect(result.notice).toContain('首页推荐')
  })

  it('serializes close-time progress flushes and waits for the most recent position', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'readex-online-test-'))
    dirs.push(root)
    const storage = new ReadexStorage()
    vi.spyOn(storage, 'getBookDirectory').mockReturnValue(root)
    const updates = vi.spyOn(storage, 'updateBook').mockResolvedValue(null)
    const writes = [0.2, 0.5, 0.9].map((fraction) => storage.saveReadingState('test-book', { type: 'text-offset', value: 'chapter-405', chapterProgress: fraction }, fraction))
    await storage.flushPendingWrites()
    await Promise.all(writes)
    const saved = JSON.parse(await fs.readFile(path.join(root, 'reading-state.json'), 'utf8'))
    expect(saved.locator.chapterProgress).toBe(0.9)
    expect(updates.mock.calls.at(-1)?.[1].progress).toBe(0.9)
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('requests the complete ixdzs directory, coalesces chapter requests and reuses cache offline', async () => {
    let offline = false
    const fetcher = vi.fn(async (url: string, options?: { body?: string }) => {
      if (offline) throw new Error('offline')
      if (url === ixdzs) return metadata + '<a href="/read/456/p3.html">仅最新章节</a>'
      if (url.endsWith('/novel/html')) { expect(options?.body).toBe('bid=456'); return toc }
      return '<article class="page-content"><section><p>测试正文，按需加载这一章节。</p></section></article>'
    })
    const service = await library(fetcher)
    const book = await service.add(ixdzs)
    const catalog = await service.getCatalog(book.id)
    expect(catalog.chapters).toHaveLength(3)
    const id = catalog.chapters[0].id
    const [first, second] = await Promise.all([service.chapter(book.id, id), service.chapter(book.id, id)])
    expect(first.text).toBe(second.text)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/p1.html'))).toHaveLength(1)
    offline = true
    expect((await service.chapter(book.id, id)).cached).toBe(true)
    await expect(service.chapter(book.id, catalog.chapters[1].id)).rejects.toThrow('offline')
    await expect(service.getCatalog(book.id, true)).rejects.toThrow('offline')
    expect((await service.getCatalog(book.id)).chapters).toHaveLength(3)
    await expect(service.chapter(book.id, '../arbitrary')).rejects.toThrow('不在目录')
  })

  it('assembles all pages of one chapter without caching partial text on failures', async () => {
    let fail = true
    const fetcher = vi.fn(async (url: string) => {
      if (url === biquge) return metadata
      if (url.endsWith('/book/123/')) return '<a href="/book/123/70.html">第一章</a>'
      if (url.endsWith('70.html')) return '<div id="content">这是第一部分的测试正文内容。</div><a href="/book/123/70_2.html">下一页</a>'
      if (fail) throw new Error('network interrupted')
      return '<div id="content">这是第二部分的测试正文内容。</div><a href="/book/123/80.html">下一章</a>'
    })
    const service = await library(fetcher)
    const book = await service.add(biquge)
    const { chapters } = await service.getCatalog(book.id)
    await expect(service.chapter(book.id, chapters[0].id)).rejects.toThrow('interrupted')
    fail = false
    const result = await service.chapter(book.id, chapters[0].id)
    expect(result.text).toContain('第一部分')
    expect(result.text).toContain('第二部分')
    expect(result.cached).toBe(false)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('70.html'))).toHaveLength(2)
  })
})
