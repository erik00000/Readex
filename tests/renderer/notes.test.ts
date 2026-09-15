import { describe, expect, it } from 'vitest'
import { annotationsToMarkdown } from '../../src/renderer/src/lib/notes'
import type { Annotation, BookRecord } from '../../src/shared/types'

describe('Markdown note export', () => {
  it('includes book metadata, quotes and comments', () => {
    const book: BookRecord = {
      id: 'book-1',
      title: '测试书籍',
      author: '作者',
      format: 'epub',
      fileName: 'book.epub',
      originalPath: 'D:/book.epub',
      importedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      size: 100,
      sha256: 'abc',
      progress: 0.2
    }
    const annotations: Annotation[] = [
      {
        id: 'a1',
        bookId: book.id,
        type: 'comment',
        color: 'blue',
        text: '这是摘录',
        note: '这是想法',
        locator: {
          type: 'epub-cfi',
          value: 'epubcfi(/6/2)',
          excerpt: '这是摘录'
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]

    const markdown = annotationsToMarkdown(book, annotations)

    expect(markdown).toContain('# 测试书籍 - 阅读笔记')
    expect(markdown).toContain('> 这是摘录')
    expect(markdown).toContain('这是想法')
  })

  it('labels bookmarks in exported notes', () => {
    const book = {
      id: 'book-2',
      title: '书签测试',
      author: '',
      format: 'epub' as const,
      fileName: 'book.epub',
      originalPath: 'D:/book.epub',
      importedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      size: 100,
      sha256: 'def',
      progress: 0
    }
    const markdown = annotationsToMarkdown(book, [
      {
        id: 'bookmark-1',
        bookId: book.id,
        type: 'bookmark',
        color: 'blue',
        text: '书签位置',
        note: '',
        locator: { type: 'epub-cfi', value: 'epubcfi(/6/4)', excerpt: '书签位置' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ])

    expect(markdown).toContain('## 书签')
    expect(markdown).toContain('> 书签位置')
  })
})
