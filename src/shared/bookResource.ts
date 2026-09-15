import type { BookFormat } from './types'

export const BOOK_RESOURCE_SCHEME = 'readex'

export function getBookResourceUrl(bookId: string, format: BookFormat): string {
  return `${BOOK_RESOURCE_SCHEME}://book/${encodeURIComponent(bookId)}/source.${format}`
}

export function getBookResourceId(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== `${BOOK_RESOURCE_SCHEME}:` || url.hostname !== 'book') return null

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length !== 2 || !/^source\.(epub|mobi|pdf|txt)$/i.test(segments[1])) {
      return null
    }

    const bookId = decodeURIComponent(segments[0])
    return bookId ? bookId : null
  } catch {
    return null
  }
}
