import { describe, expect, it } from 'vitest'
import {
  findAdjacentTocItem,
  findTocItemForLocator,
  findTocProgress
} from '../../src/renderer/src/lib/toc'
import type { TocItem } from '../../src/shared/types'

const toc: TocItem[] = [
  {
    id: 'book-2',
    label: '第二册',
    href: 'Text/part2.xhtml',
    children: [
      { id: 'chapter-10', label: '第十章', href: 'Text/chapter10.xhtml' },
      { id: 'chapter-11', label: '第十一章', href: 'Text/chapter11.xhtml' }
    ]
  }
]

describe('table of contents selection', () => {
  it('finds a nested chapter from an EPUB href', () => {
    const item = findTocItemForLocator(toc, {
      type: 'epub-cfi',
      value: 'epubcfi(/6/10)',
      chapterHref: 'Text/chapter11.xhtml'
    })
    expect(item?.id).toBe('chapter-11')
  })

  it('finds an item by chapter id', () => {
    const item = findTocItemForLocator(
      [{ id: 'pdf-page-1', label: '第 1 页', chapterId: '1' }],
      { type: 'pdf-rect', value: '1', chapterId: '1', page: 1 }
    )
    expect(item?.label).toBe('第 1 页')
  })

  it('finds a PDF page from its page locator', () => {
    const item = findTocItemForLocator(
      [
        { id: 'pdf-page-1', label: '第 1 页', chapterId: '1' },
        { id: 'pdf-page-2', label: '第 2 页', chapterId: '2' }
      ],
      { type: 'pdf-rect', value: '2', page: 2 }
    )
    expect(item?.id).toBe('pdf-page-2')
  })

  it('calculates chapter position from leaf chapters', () => {
    const progress = findTocProgress(toc, 'chapter-11')
    expect(progress).toEqual({
      label: '第十一章',
      current: 2,
      total: 2,
      percent: 100
    })
  })

  it('ignores navigation pages and advances to the first readable chapter', () => {
    const progress = findTocProgress(
      [
        { id: 'toc', label: '目录', href: 'nav.xhtml' },
        { id: 'chapter-1', label: '第一章', href: 'chapter1.xhtml' },
        { id: 'chapter-2', label: '第二章', href: 'chapter2.xhtml' }
      ],
      'toc'
    )

    expect(progress).toEqual({
      label: '第一章',
      current: 1,
      total: 2,
      percent: 50
    })
  })

  it('navigates between readable chapters and skips navigation pages', () => {
    const items: TocItem[] = [
      { id: 'cover', label: '封面', href: 'cover.xhtml' },
      { id: 'chapter-1', label: '第一章', href: 'chapter1.xhtml' },
      { id: 'chapter-2', label: '第二章', href: 'chapter2.xhtml' }
    ]

    expect(findAdjacentTocItem(items, 'chapter-1', 'next')?.id).toBe('chapter-2')
    expect(findAdjacentTocItem(items, 'chapter-2', 'previous')?.id).toBe('chapter-1')
    expect(findAdjacentTocItem(items, undefined, 'next')?.id).toBe('chapter-1')
    expect(findAdjacentTocItem(items, 'chapter-2', 'next')).toBeNull()
  })
})
