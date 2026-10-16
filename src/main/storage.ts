import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  Annotation,
  AnnotationFile,
  AppSettings,
  BookRecord,
  LibraryData,
  ProfileInfo,
  ReadingLocator,
  ReadingState
} from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import {
  DEFAULT_TTS_VOICE,
  TTS_MAX_RATE,
  TTS_MAX_VOLUME,
  TTS_MIN_RATE,
  TTS_MIN_VOLUME
} from '../shared/speech'

export interface DataPaths {
  root: string
  personal: string
  cache: string
  books: string
  importCache: string
  parseCache: string
  ttsCache: string
  settings: string
  library: string
}

function getDataRoot(): string {
  if (app.isPackaged) {
    const executableDirectory =
      process.env.PORTABLE_EXECUTABLE_DIR ?? path.dirname(process.execPath)
    return path.join(executableDirectory, 'data')
  }

  return path.join(process.cwd(), 'data-dev')
}

export function getDataPaths(): DataPaths {
  const root = getDataRoot()
  const personal = path.join(root, 'personal')
  const cache = path.join(root, 'cache')

  return {
    root,
    personal,
    cache,
    books: path.join(personal, 'books'),
    importCache: path.join(cache, 'import'),
    parseCache: path.join(cache, 'parsed'),
    ttsCache: path.join(cache, 'tts'),
    settings: path.join(personal, 'settings.json'),
    library: path.join(personal, 'library.json')
  }
}

export async function ensureDataDirectories(): Promise<DataPaths> {
  const paths = getDataPaths()
  await Promise.all([
    fs.mkdir(paths.personal, { recursive: true }),
    fs.mkdir(paths.books, { recursive: true }),
    fs.mkdir(paths.importCache, { recursive: true }),
    fs.mkdir(paths.parseCache, { recursive: true }),
    fs.mkdir(paths.ttsCache, { recursive: true })
  ])
  return paths
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || error instanceof SyntaxError) {
      return fallback
    }
    throw error
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const content = `${JSON.stringify(value, null, 2)}\n`
  await fs.writeFile(temporaryPath, content, 'utf8')

  try {
    await fs.rename(temporaryPath, filePath)
  } catch {
    await fs.rm(filePath, { force: true })
    await fs.rename(temporaryPath, filePath)
  }
}

export class ReadexStorage {
  private paths = getDataPaths()
  private libraryWrite = Promise.resolve()
  private settingsWrite = Promise.resolve()

  async initialize(): Promise<void> {
    this.paths = await ensureDataDirectories()
    await Promise.all([
      ensureJsonFile(this.paths.library, {
        schemaVersion: 1,
        books: []
      } satisfies LibraryData),
      ensureJsonFile(this.paths.settings, DEFAULT_SETTINGS)
    ])
  }

  getPaths(): DataPaths {
    return this.paths
  }

  async getLibrary(): Promise<LibraryData> {
    const library = await readJson<LibraryData>(this.paths.library, {
      schemaVersion: 1,
      books: []
    })

    return {
      schemaVersion: 1,
      books: Array.isArray(library.books) ? library.books : []
    }
  }

  async saveLibrary(library: LibraryData): Promise<void> {
    this.libraryWrite = this.libraryWrite.then(() => writeJsonAtomic(this.paths.library, library))
    await this.libraryWrite
  }

  async addBook(book: BookRecord): Promise<void> {
    const library = await this.getLibrary()
    const existingIndex = library.books.findIndex((item) => item.id === book.id)
    if (existingIndex >= 0) {
      library.books[existingIndex] = book
    } else {
      library.books.push(book)
    }
    await this.saveLibrary(library)
  }

  async updateBook(bookId: string, patch: Partial<BookRecord>): Promise<BookRecord | null> {
    const library = await this.getLibrary()
    const index = library.books.findIndex((book) => book.id === bookId)
    if (index < 0) return null

    const updated = {
      ...library.books[index],
      ...patch,
      id: library.books[index].id,
      updatedAt: new Date().toISOString()
    }
    library.books[index] = updated
    await this.saveLibrary(library)
    return updated
  }

  async removeBook(bookId: string, deleteSource: boolean): Promise<void> {
    const library = await this.getLibrary()
    const book = library.books.find((item) => item.id === bookId)
    if (!book) return

    const nextLibrary = {
      ...library,
      books: library.books.filter((item) => item.id !== bookId)
    }
    await this.saveLibrary(nextLibrary)

    if (deleteSource) {
      await fs.rm(path.join(this.paths.books, bookId), { recursive: true, force: true })
      await fs.rm(path.join(this.paths.parseCache, bookId), { recursive: true, force: true })
    }
  }

  getBookDirectory(bookId: string): string {
    return path.join(this.paths.books, bookId)
  }

  getBookSourcePath(book: Pick<BookRecord, 'id' | 'format'>): string {
    return path.join(this.getBookDirectory(book.id), `source.${book.format}`)
  }

  async getBookRecord(bookId: string): Promise<BookRecord | null> {
    const library = await this.getLibrary()
    return library.books.find((book) => book.id === bookId) ?? null
  }

  async getSettings(): Promise<AppSettings> {
    const settings = await readJson<AppSettings>(this.paths.settings, DEFAULT_SETTINGS)
    return {
      schemaVersion: 1,
      reader: migrateReaderSettings(settings.reader),
      workspaces: Array.isArray(settings.workspaces) ? settings.workspaces : [],
      activeBookId: settings.activeBookId ?? null
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const normalized: AppSettings = {
      schemaVersion: 1,
      reader: {
        ...DEFAULT_SETTINGS.reader,
        ...settings.reader
      },
      workspaces: settings.workspaces,
      activeBookId: settings.activeBookId
    }
    this.settingsWrite = this.settingsWrite.then(() => writeJsonAtomic(this.paths.settings, normalized))
    await this.settingsWrite
    return normalized
  }

  async getAnnotations(bookId: string): Promise<Annotation[]> {
    const file = path.join(this.getBookDirectory(bookId), 'annotations.json')
    const data = await readJson<AnnotationFile>(file, {
      schemaVersion: 1,
      annotations: []
    })
    return Array.isArray(data.annotations) ? data.annotations : []
  }

  async getAllAnnotations(): Promise<Annotation[]> {
    const library = await this.getLibrary()
    const groups = await Promise.all(
      library.books.map((book) => this.getAnnotations(book.id))
    )
    return groups.flat()
  }

  async saveAnnotation(annotation: Annotation): Promise<Annotation[]> {
    const annotations = await this.getAnnotations(annotation.bookId)
    const index = annotations.findIndex((item) => item.id === annotation.id)
    if (index >= 0) {
      annotations[index] = annotation
    } else {
      annotations.push(annotation)
    }
    await writeJsonAtomic(path.join(this.getBookDirectory(annotation.bookId), 'annotations.json'), {
      schemaVersion: 1,
      annotations
    } satisfies AnnotationFile)
    return annotations
  }

  async removeAnnotation(bookId: string, annotationId: string): Promise<Annotation[]> {
    const annotations = (await this.getAnnotations(bookId)).filter((item) => item.id !== annotationId)
    await writeJsonAtomic(path.join(this.getBookDirectory(bookId), 'annotations.json'), {
      schemaVersion: 1,
      annotations
    } satisfies AnnotationFile)
    return annotations
  }

  async getReadingState(bookId: string): Promise<ReadingState | null> {
    const file = path.join(this.getBookDirectory(bookId), 'reading-state.json')
    try {
      return await readJson<ReadingState | null>(file, null)
    } catch {
      return null
    }
  }

  async saveReadingState(bookId: string, locator: ReadingLocator, progress: number): Promise<void> {
    await writeJsonAtomic(path.join(this.getBookDirectory(bookId), 'reading-state.json'), {
      schemaVersion: 1,
      locator,
      progress: Math.max(0, Math.min(1, progress)),
      updatedAt: new Date().toISOString()
    } satisfies ReadingState)
    await this.updateBook(bookId, {
      lastLocation: locator,
      progress: Math.max(0, Math.min(1, progress))
    })
  }

  async getProfileInfo(): Promise<ProfileInfo> {
    const books = (await this.getLibrary()).books
    let annotationCount = 0
    let sizeBytes = 0

    for (const book of books) {
      annotationCount += (await this.getAnnotations(book.id)).length
      sizeBytes += await directorySize(path.join(this.paths.books, book.id))
    }

    return {
      personalPath: this.paths.personal,
      cachePath: this.paths.cache,
      bookCount: books.length,
      annotationCount,
      sizeBytes
    }
  }

  async resetPersonalData(): Promise<void> {
    await fs.rm(this.paths.personal, { recursive: true, force: true })
    await fs.mkdir(this.paths.books, { recursive: true })
    await writeJsonAtomic(this.paths.library, {
      schemaVersion: 1,
      books: []
    } satisfies LibraryData)
    await writeJsonAtomic(this.paths.settings, DEFAULT_SETTINGS)
  }
}

export function migrateReaderSettings(
  input: Partial<AppSettings['reader']> | undefined
): AppSettings['reader'] {
  const reader = {
    ...DEFAULT_SETTINGS.reader,
    ...(input ?? {})
  }
  reader.ttsVoice =
    typeof input?.ttsVoice === 'string' && /^[A-Za-z0-9-]{3,80}$/.test(input.ttsVoice)
      ? input.ttsVoice
      : DEFAULT_TTS_VOICE
  reader.ttsRate = clampNumber(input?.ttsRate, TTS_MIN_RATE, TTS_MAX_RATE, 1)
  reader.ttsVolume = clampNumber(input?.ttsVolume, TTS_MIN_VOLUME, TTS_MAX_VOLUME, 1)
  reader.readingMode = input?.readingMode === 'paged' ? 'paged' : 'continuous'
  if (input?.floatingReaderWidth === undefined) {
    reader.floatingReaderWidth = input?.contentWidth ?? reader.contentWidth
  }
  if (input?.floatingReaderHeight === undefined) {
    reader.floatingReaderHeight = DEFAULT_SETTINGS.reader.floatingReaderHeight
  }
  if (input?.autoScrollSpeed !== undefined && input.autoScrollSpeed <= 10) {
    reader.autoScrollSpeed = Math.max(
      1,
      Math.min(100, Math.round(input.autoScrollSpeed * 6 + 1))
    )
  } else if (input?.autoScrollSpeed !== undefined) {
    reader.autoScrollSpeed = Math.max(
      1,
      Math.min(100, Math.round(input.autoScrollSpeed))
    )
  }
  if (input?.pdfScale === 1.15) {
    reader.pdfScale = DEFAULT_SETTINGS.reader.pdfScale
  }
  const legacySerif =
    input?.fontFamily === '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, serif'
  if (
    legacySerif &&
    input?.fontSize === 19 &&
    input?.lineHeight === 1.85 &&
    input?.contentWidth === 760
  ) {
    return {
      ...reader,
      fontFamily: DEFAULT_SETTINGS.reader.fontFamily,
      fontSize: DEFAULT_SETTINGS.reader.fontSize,
      lineHeight: DEFAULT_SETTINGS.reader.lineHeight,
      paragraphSpacing: DEFAULT_SETTINGS.reader.paragraphSpacing,
      letterSpacing: DEFAULT_SETTINGS.reader.letterSpacing,
      contentWidth: DEFAULT_SETTINGS.reader.contentWidth
    }
  }
  return reader
}

function clampNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.min(maximum, value as number))
}

async function ensureJsonFile(filePath: string, fallback: unknown): Promise<void> {
  try {
    await fs.access(filePath)
  } catch {
    await writeJsonAtomic(filePath, fallback)
  }
}

async function directorySize(directory: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      total += await directorySize(entryPath)
    } else if (entry.isFile()) {
      total += (await fs.stat(entryPath)).size
    }
  }
  return total
}
