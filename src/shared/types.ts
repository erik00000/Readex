export const BOOK_FORMATS = ['epub', 'mobi', 'pdf', 'txt'] as const

export type BookFormat = (typeof BOOK_FORMATS)[number]

export type ThemeMode = 'dark' | 'light' | 'sepia' | 'custom'
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink'
export type AnnotationType = 'highlight' | 'comment' | 'bookmark'
/** How the auto-scroll reading focus is visualised. */
export type AutoScrollHighlightStyle = 'band' | 'sentence'

export interface BookMetadata {
  title: string
  author: string
  language?: string
  publisher?: string
  description?: string
  chapterCount?: number
}

export interface BookRecord extends BookMetadata {
  id: string
  format: BookFormat
  fileName: string
  originalPath: string
  importedAt: string
  updatedAt: string
  size: number
  sha256: string
  coverDataUrl?: string
  progress: number
  lastLocation?: ReadingLocator
}

export interface LibraryData {
  schemaVersion: 1
  books: BookRecord[]
}

export interface ReaderSettings {
  theme: ThemeMode
  backgroundColor: string
  textColor: string
  accentColor: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  paragraphSpacing: number
  letterSpacing: number
  contentWidth: number
  floatingReaderWidth: number
  floatingReaderHeight: number
  pdfScale: number
  wheelScrollStep: number
  smoothScrolling: boolean
  autoScrollSpeed: number
  autoScrollColor: string
  autoScrollHighlight: boolean
  autoScrollHighlightStyle: AutoScrollHighlightStyle
  ttsVoice: string
  ttsRate: number
  ttsVolume: number
}

export interface WorkspaceSession {
  bookId: string
  openedAt: string
}

export interface AppSettings {
  schemaVersion: 1
  reader: ReaderSettings
  workspaces: WorkspaceSession[]
  activeBookId: string | null
}

export type LocatorType = 'epub-cfi' | 'pdf-rect' | 'text-offset' | 'mobi-offset'

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ReadingLocator {
  type: LocatorType
  value: string
  chapterId?: string
  chapterHref?: string
  page?: number
  start?: number
  end?: number
  rects?: PdfRect[]
  excerpt?: string
  prefix?: string
  suffix?: string
}

export interface Annotation {
  id: string
  bookId: string
  type: AnnotationType
  color: AnnotationColor
  text: string
  note: string
  locator: ReadingLocator
  createdAt: string
  updatedAt: string
}

export interface AnnotationFile {
  schemaVersion: 1
  annotations: Annotation[]
}

export interface ReadingState {
  schemaVersion: 1
  locator: ReadingLocator | null
  progress: number
  updatedAt: string
}

export interface TocItem {
  id: string
  label: string
  href?: string
  chapterId?: string
  children?: TocItem[]
}

export interface NormalizedChapter {
  id: string
  label: string
  html: string
  text: string
}

export interface BookContent {
  format: BookFormat
  toc: TocItem[]
  chapters?: NormalizedChapter[]
  text?: string
}

export interface ImportJob {
  id: string
  path: string
  fileName: string
  status: 'queued' | 'checking' | 'importing' | 'success' | 'skipped' | 'failed' | 'cancelled'
  progress: number
  message?: string
  bookId?: string
}

export interface ImportBatchResult {
  jobs: ImportJob[]
  books: BookRecord[]
}

export interface ImportProgressEvent {
  batchId: string
  job: ImportJob
  completed: number
  total: number
}

export interface SearchResult {
  id: string
  bookId?: string
  bookTitle?: string
  source: 'text' | 'annotation'
  title: string
  excerpt: string
  locator?: ReadingLocator
}

export interface ChapterProgress {
  label: string
  current: number
  total: number
  percent: number
}

export interface ProfileInfo {
  personalPath: string
  cachePath: string
  bookCount: number
  annotationCount: number
  sizeBytes: number
}

export interface BackupResult {
  canceled: boolean
  filePath?: string
}

export interface ClearProfileResult {
  cleared: boolean
}

export interface WindowState {
  maximized: boolean
  fullscreen: boolean
}

export interface FloatingReaderSync {
  settings: AppSettings
  locator: ReadingLocator | null
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'dark',
  backgroundColor: '#171717',
  textColor: '#e8e8e8',
  accentColor: '#60a5fa',
  fontFamily: '"Segoe UI Variable Text", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  fontSize: 17,
  lineHeight: 1.78,
  paragraphSpacing: 0.78,
  letterSpacing: 0,
  contentWidth: 860,
  floatingReaderWidth: 860,
  floatingReaderHeight: 200,
  pdfScale: 1,
  wheelScrollStep: 48,
  smoothScrolling: true,
  autoScrollSpeed: 25,
  autoScrollColor: '#b7e4c7',
  autoScrollHighlight: true,
  autoScrollHighlightStyle: 'band',
  ttsVoice: 'zh-CN-XiaoxiaoNeural',
  ttsRate: 1,
  ttsVolume: 1
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  reader: DEFAULT_READER_SETTINGS,
  workspaces: [],
  activeBookId: null
}

export const THEME_PRESETS: Record<
  Exclude<ThemeMode, 'custom'>,
  Pick<ReaderSettings, 'backgroundColor' | 'textColor' | 'accentColor'>
> = {
  dark: {
    backgroundColor: '#1c1a18',
    textColor: '#eae6e0',
    accentColor: '#e08a5a'
  },
  light: {
    backgroundColor: '#f7f4ef',
    textColor: '#37312a',
    accentColor: '#b95c33'
  },
  sepia: {
    backgroundColor: '#f3ead8',
    textColor: '#3e3427',
    accentColor: '#9a5b2d'
  }
}

/**
 * Pre-refresh preset values. Profiles saved with these exact colors are
 * silently upgraded to the current palette so the app picks up the warmer
 * Codex-style theme without touching genuinely custom colors.
 */
export const LEGACY_THEME_PRESETS: Record<
  Exclude<ThemeMode, 'custom'>,
  Pick<ReaderSettings, 'backgroundColor' | 'textColor' | 'accentColor'>
> = {
  dark: {
    backgroundColor: '#171717',
    textColor: '#e8e8e8',
    accentColor: '#60a5fa'
  },
  light: {
    backgroundColor: '#ffffff',
    textColor: '#242424',
    accentColor: '#2563eb'
  },
  sepia: {
    backgroundColor: '#f3ead8',
    textColor: '#3e3427',
    accentColor: '#9a5b2d'
  }
}

export function upgradeLegacyThemeColors(
  reader: ReaderSettings
): ReaderSettings {
  const theme = reader.theme
  if (theme === 'custom') return reader
  const legacy = LEGACY_THEME_PRESETS[theme]
  const matches =
    legacy &&
    reader.backgroundColor === legacy.backgroundColor &&
    reader.textColor === legacy.textColor &&
    reader.accentColor === legacy.accentColor
  return matches ? { ...reader, ...THEME_PRESETS[theme] } : reader
}

export const ANNOTATION_COLORS: Record<AnnotationColor, string> = {
  yellow: '#f5c542',
  green: '#57b894',
  blue: '#5b9cf6',
  pink: '#e978a8'
}
