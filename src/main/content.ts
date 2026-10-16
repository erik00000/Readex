import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  BookContent,
  BookRecord,
  NormalizedChapter,
  SearchResult,
  TocItem
} from '../shared/types'
import { ReadexStorage, readJson, writeJsonAtomic } from './storage'
import { decodeTextBuffer } from './text'

// Bump this whenever the TXT chapter/TOC mapping changes. Existing cached
// content must be reparsed so old fixed-section IDs cannot affect navigation.
const TXT_CONTENT_PARSER_VERSION = 2

export async function getBookContent(
  storage: ReadexStorage,
  book: BookRecord
): Promise<BookContent | null> {
  if (book.format === 'epub' || book.format === 'pdf') {
    return {
      format: book.format,
      toc: []
    }
  }

  const cachePath = path.join(storage.getPaths().parseCache, book.id, 'content.json')
  const cached = await readJson<BookContent | null>(cachePath, null)
  if (
    cached &&
    cached.format === book.format &&
    (book.format !== 'txt' || cached.parserVersion === TXT_CONTENT_PARSER_VERSION)
  ) {
    return cached
  }

  const sourcePath = storage.getBookSourcePath(book)
  const content =
    book.format === 'mobi'
      ? await parseMobiContent(sourcePath, path.join(storage.getPaths().parseCache, book.id, 'resources'))
      : await parseTxtContent(sourcePath)

  await writeJsonAtomic(cachePath, content)
  return content
}

export async function searchBookContent(
  storage: ReadexStorage,
  book: BookRecord,
  query: string
): Promise<SearchResult[]> {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length < 1) return []

  if (book.format === 'epub' || book.format === 'pdf') return []
  const content = await getBookContent(storage, book)
  if (!content) return []

  const results: SearchResult[] = []
  for (const chapter of content.chapters ?? []) {
    const lower = chapter.text.toLocaleLowerCase()
    let from = 0
    while (results.length < 200) {
      const index = lower.indexOf(normalized, from)
      if (index < 0) break
      results.push({
        id: `${book.id}:${chapter.id}:${index}`,
        bookId: book.id,
        bookTitle: book.title,
        source: 'text',
        title: chapter.label || book.title,
        excerpt: excerptAt(chapter.text, index, normalized.length),
        locator: {
          type: 'mobi-offset',
          value: `${chapter.id}:${index}:${index + normalized.length}`,
          chapterId: chapter.id,
          start: index,
          end: index + normalized.length,
          excerpt: chapter.text.slice(index, index + normalized.length)
        }
      })
      from = index + Math.max(1, normalized.length)
    }
    if (results.length >= 200) break
  }

  return results
}

async function parseMobiContent(sourcePath: string, resourceDirectory: string): Promise<BookContent> {
  await fs.mkdir(resourceDirectory, { recursive: true })
  const { openMobiDocument } = await import('./mobi')
  const mobi = await openMobiDocument(await fs.readFile(sourcePath), resourceDirectory)

  try {
    const spine = mobi.getSpine()
    const chapters: NormalizedChapter[] = []
    for (let index = 0; index < spine.length; index += 1) {
      const item = spine[index]
      const chapterId = String(item.id)
      const processed = mobi.loadChapter(chapterId)
      const html = await embedLocalResources(processed?.html ?? '')
      chapters.push({
        id: chapterId,
        label: `第 ${index + 1} 节`,
        html,
        text: htmlToText(html)
      })
    }

    const toc = mapMobiToc(mobi.getToc(), (href) => mobi.resolveHref(href))
    return {
      format: 'mobi',
      toc,
      chapters
    }
  } finally {
    mobi.destroy()
  }
}

async function embedLocalResources(html: string): Promise<string> {
  const paths = new Set<string>()
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const candidate = match[1]
    if (/^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith('file:')) {
      paths.add(candidate)
    }
  }

  let result = html
  for (const resourcePath of paths) {
    try {
      const localPath = resourcePath.startsWith('file:')
        ? decodeURIComponent(new URL(resourcePath).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
        : resourcePath
      const data = await fs.readFile(localPath)
      if (data.byteLength > 5 * 1024 * 1024) continue
      const dataUrl = `data:${mimeForPath(localPath)};base64,${data.toString('base64')}`
      result = result.split(resourcePath).join(dataUrl)
    } catch {
      // Missing optional resources should not make an otherwise readable book fail.
    }
  }
  return result
}

export async function parseTxtContent(sourcePath: string): Promise<BookContent> {
  const buffer = await fs.readFile(sourcePath)
  const text = decodeTextBuffer(buffer)
  const chapters = splitTxtIntoChapters(text)
  return {
    format: 'txt',
    parserVersion: TXT_CONTENT_PARSER_VERSION,
    toc: chapters.map((chapter) => ({
      id: chapter.id,
      label: chapter.label,
      chapterId: chapter.id
    })),
    chapters
  }
}

function splitTxtIntoChapters(text: string): NormalizedChapter[] {
  const headingPattern = /^[ \t]*第[ \t]*\d+[ \t]*(?:章|节|回|篇|卷|部)[^\r\n]*$/gm
  const headings = [...text.matchAll(headingPattern)]
  if (headings.length > 0) {
    const occurrences = new Map<number, number>()
    return headings.map((match, index) => {
      const start = match.index ?? 0
      const end = headings[index + 1]?.index ?? text.length
      const heading = match[0].trim().replace(/\s+/g, ' ')
      const numberMatch = heading.match(/^第\s*(\d+)/)
      const chapterNumber = numberMatch ? Number(numberMatch[1]) : index + 1
      const occurrence = occurrences.get(chapterNumber) ?? 0
      occurrences.set(chapterNumber, occurrence + 1)
      const prefix = index === 0 ? text.slice(0, start).trim() : ''
      const body = text.slice(start, end).trim()
      const value = prefix ? `${prefix}\n\n${body}` : body
      return {
        id: `txt-chapter-${chapterNumber}-${occurrence}`,
        label: heading,
        html: value
          .split(/\n{2,}/)
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
          .join(''),
        text: value
      }
    })
  }

  const targetSize = 24_000
  const chapters: NormalizedChapter[] = []
  let cursor = 0
  let section = 1

  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + targetSize)
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end)
      if (newline > cursor + targetSize * 0.6) end = newline + 1
    }

    const value = text.slice(cursor, end)
    chapters.push({
      id: `txt-${section}`,
      label: `第 ${section} 节`,
      html: value
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
        .join(''),
      text: value
    })
    cursor = end
    section += 1
  }

  return chapters
}

function mapMobiToc(
  items: unknown[],
  resolver: (href: string) => { id: string; selector: string } | undefined
): TocItem[] {
  return items.map((item, index) => {
    const record = item as Record<string, unknown>
    const href = typeof record.href === 'string' ? record.href : ''
    const resolved = href ? resolver(href) : undefined
    const children = Array.isArray(record.children)
      ? mapMobiToc(record.children, resolver)
      : undefined

    return {
      id: `toc-${index}-${resolved?.id ?? href}`,
      label: String(record.label ?? `章节 ${index + 1}`),
      href,
      chapterId: resolved?.id,
      children
    }
  })
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mimeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  return (
    {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp'
    }[extension] ?? 'application/octet-stream'
  )
}

function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + length + 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
}
