import type { ChapterProgress, ReadingLocator, TocItem } from '@shared/types'

export function findTocItemForLocator(
  items: TocItem[],
  locator: ReadingLocator
): TocItem | null {
  for (const item of items) {
    if (matchesLocator(item, locator)) return item
    if (item.children?.length) {
      const child = findTocItemForLocator(item.children, locator)
      if (child) return child
    }
  }
  return null
}

export function findTocProgress(
  items: TocItem[],
  activeId?: string
): ChapterProgress | null {
  const allLeaves = collectLeafItems(items)
  const leaves = allLeaves.filter((item) => !isNonReadingItem(item))
  if (leaves.length === 0) return null

  let index = -1
  if (activeId) {
    let activeLeafIndex = allLeaves.findIndex((item) => item.id === activeId)
    if (activeLeafIndex < 0) {
      const activeItem = findItemById(items, activeId)
      const firstLeaf = activeItem ? collectLeafItems([activeItem])[0] : undefined
      activeLeafIndex = firstLeaf
        ? allLeaves.findIndex((item) => item.id === firstLeaf.id)
        : -1
    }
    if (activeLeafIndex >= 0) {
      const nextContentLeaf = leaves.find(
        (item) => allLeaves.indexOf(item) >= activeLeafIndex
      )
      index = nextContentLeaf ? leaves.indexOf(nextContentLeaf) : leaves.length - 1
    }
  }
  if (index < 0 && activeId) {
    const activeItem = findItemById(items, activeId)
    const firstLeaf = activeItem ? collectLeafItems([activeItem])[0] : undefined
    index = firstLeaf ? leaves.findIndex((item) => item.id === firstLeaf.id) : -1
  }
  if (index < 0) index = 0

  const current = index + 1
  return {
    label: leaves[index].label,
    current,
    total: leaves.length,
    percent: Math.round((current / leaves.length) * 1000) / 10
  }
}

export function findAdjacentTocItem(
  items: TocItem[],
  activeId: string | undefined,
  direction: 'previous' | 'next'
): TocItem | null {
  const leaves = collectLeafItems(items).filter((item) => !isNonReadingItem(item))
  if (leaves.length === 0) return null

  const activeItem = activeId ? findItemById(items, activeId) : null
  const activeLeaf = activeItem?.children?.length
    ? collectLeafItems([activeItem]).find((item) => !isNonReadingItem(item))
    : activeItem
  const activeIndex = activeLeaf
    ? leaves.findIndex((item) => item.id === activeLeaf.id)
    : -1
  const nextIndex =
    activeIndex < 0
      ? direction === 'next'
        ? 0
        : -1
      : activeIndex + (direction === 'next' ? 1 : -1)

  return leaves[nextIndex] ?? null
}

export function findTocItemById(items: TocItem[], id?: string): TocItem | null {
  return id ? findItemById(items, id) : null
}

function isNonReadingItem(item: TocItem): boolean {
  const label = item.label.trim().toLocaleLowerCase()
  return [
    '封面',
    '目录',
    '扉页',
    '版权',
    '书名页',
    'cover',
    'contents',
    'table of contents',
    'title page',
    'copyright'
  ].includes(label)
}

function collectLeafItems(items: TocItem[]): TocItem[] {
  const leaves: TocItem[] = []
  for (const item of items) {
    if (item.children?.length) leaves.push(...collectLeafItems(item.children))
    else leaves.push(item)
  }
  return leaves
}

function findItemById(items: TocItem[], id: string): TocItem | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children?.length) {
      const child = findItemById(item.children, id)
      if (child) return child
    }
  }
  return null
}

function matchesLocator(item: TocItem, locator: ReadingLocator): boolean {
  if (locator.chapterId && item.chapterId === locator.chapterId) return true
  if (locator.page !== undefined && item.chapterId === String(locator.page)) return true
  if (locator.chapterHref && item.href) {
    return normalizeHref(item.href) === normalizeHref(locator.chapterHref)
  }
  return false
}

function normalizeHref(value: string): string {
  let href = value
  try {
    href = decodeURIComponent(value)
  } catch {
    // Keep malformed hrefs stable for comparison.
  }
  return href.split('#')[0].replace(/^\.?\//, '').replace(/\\/g, '/')
}
