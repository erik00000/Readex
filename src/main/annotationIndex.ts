import type { Annotation, SearchResult } from '../shared/types'
import type { ReadexStorage } from './storage'

interface IndexedAnnotation {
  annotation: Annotation
  bookTitle: string
  searchText: string
}

export class AnnotationIndex {
  private entries: IndexedAnnotation[] | null = null
  private building: Promise<void> | null = null
  private generation = 0

  constructor(private readonly storage: ReadexStorage) {}

  invalidate(): void {
    this.generation += 1
    this.entries = null
    this.building = null
  }

  async warm(): Promise<void> {
    await this.ensureBuilt()
  }

  updateBook(bookId: string, bookTitle: string, annotations: Annotation[]): void {
    if (!this.entries) {
      this.invalidate()
      return
    }
    this.generation += 1
    this.entries = [
      ...this.entries.filter((entry) => entry.annotation.bookId !== bookId),
      ...annotations.map((annotation) => createEntry(annotation, bookTitle))
    ]
  }

  async search(query: string, limit = 200): Promise<SearchResult[]> {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    await this.ensureBuilt()

    const results: SearchResult[] = []
    for (const entry of this.entries ?? []) {
      if (!entry.searchText.includes(normalized)) continue
      results.push({
        id: entry.annotation.id,
        bookId: entry.annotation.bookId,
        bookTitle: entry.bookTitle,
        source: 'annotation',
        title: entry.annotation.type === 'bookmark'
          ? '书签'
          : entry.annotation.note
            ? '笔记'
            : '高亮',
        excerpt: entry.annotation.note || entry.annotation.text,
        locator: entry.annotation.locator
      })
      if (results.length >= limit) break
    }

    return results
  }

  private async ensureBuilt(): Promise<void> {
    if (this.entries) return
    if (!this.building) {
      const generation = this.generation
      this.building = this.build(generation)
    }
    await this.building
  }

  private async build(generation: number): Promise<void> {
    try {
      const library = await this.storage.getLibrary()
      const groups = await Promise.all(
        library.books.map(async (book) => ({
          book,
          annotations: await this.storage.getAnnotations(book.id)
        }))
      )
      if (this.generation === generation) {
        this.entries = groups.flatMap(({ book, annotations }) =>
          annotations.map((annotation) => createEntry(annotation, book.title))
        )
      }
    } finally {
      if (this.generation === generation) this.building = null
    }
  }
}

function createEntry(annotation: Annotation, bookTitle: string): IndexedAnnotation {
  return {
    annotation,
    bookTitle,
    searchText: `${annotation.text}\n${annotation.note}`.toLocaleLowerCase()
  }
}
