import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { BookFormat } from '../shared/types'
import { BOOK_RESOURCE_SCHEME, getBookResourceId } from '../shared/bookResource'
import type { ReadexStorage } from './storage'

export type ByteRangeResult =
  | { kind: 'none' }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'unsatisfiable' }

export function parseByteRange(value: string | null, size: number): ByteRangeResult {
  if (!value) return { kind: 'none' }
  if (size <= 0) return { kind: 'unsatisfiable' }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return { kind: 'unsatisfiable' }

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: 'unsatisfiable' }
    }
    return {
      kind: 'range',
      start: Math.max(0, size - suffixLength),
      end: size - 1
    }
  }

  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
    return { kind: 'unsatisfiable' }
  }

  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return { kind: 'unsatisfiable' }
  }

  return {
    kind: 'range',
    start,
    end: Math.min(requestedEnd, size - 1)
  }
}

export function contentTypeForBookFormat(format: BookFormat): string {
  switch (format) {
    case 'epub':
      return 'application/epub+zip'
    case 'mobi':
      return 'application/x-mobipocket-ebook'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain; charset=utf-8'
  }
}

export function registerBookScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: BOOK_RESOURCE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function registerBookProtocol(storage: ReadexStorage): void {
  protocol.handle(BOOK_RESOURCE_SCHEME, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders() })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: responseHeaders({ Allow: 'GET, HEAD, OPTIONS' })
      })
    }

    const bookId = getBookResourceId(request.url)
    const book = bookId ? await storage.getBookRecord(bookId) : null
    if (!book) return new Response('Book not found', { status: 404, headers: responseHeaders() })

    const filePath = storage.getBookSourcePath(book)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile()) {
      return new Response('Book file not found', { status: 404, headers: responseHeaders() })
    }

    const range = parseByteRange(request.headers.get('range'), stat.size)
    if (range.kind === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: responseHeaders({ 'Content-Range': `bytes */${stat.size}` })
      })
    }

    const start = range.kind === 'range' ? range.start : 0
    const end = range.kind === 'range' ? range.end : Math.max(0, stat.size - 1)
    const length = stat.size === 0 ? 0 : end - start + 1
    const headers = responseHeaders({
      'Accept-Ranges': 'bytes',
      'Content-Type': contentTypeForBookFormat(book.format),
      'Content-Length': String(length),
      ...(range.kind === 'range'
        ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` }
        : {})
    })

    if (request.method === 'HEAD' || length === 0) {
      return new Response(null, {
        status: range.kind === 'range' ? 206 : 200,
        headers
      })
    }

    const stream = createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
      status: range.kind === 'range' ? 206 : 200,
      headers
    })
  })
}

function responseHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
    'Cache-Control': 'no-store',
    ...extra
  })
}
