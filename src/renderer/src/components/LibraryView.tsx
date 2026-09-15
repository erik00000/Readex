import { useMemo, useState } from 'react'
import {
  BookOpen,
  FilePlus2,
  FolderSearch,
  LibraryBig,
  MoreHorizontal,
  Search,
  Trash2
} from 'lucide-react'
import type { BookRecord } from '@shared/types'
import { bookFormatLabel, formatBytes, formatDate, formatPercent } from '../lib/format'

interface LibraryViewProps {
  books: BookRecord[]
  importing: boolean
  onImport: () => void
  onImportPaths: (paths: string[]) => void
  onOpenBook: (bookId: string) => void
  onReveal: (bookId: string) => void
  onRemove: (book: BookRecord) => void
}

export function LibraryView({
  books,
  importing,
  onImport,
  onImportPaths,
  onOpenBook,
  onReveal,
  onRemove
}: LibraryViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return books
    return books.filter((book) =>
      `${book.title} ${book.author} ${book.format}`.toLocaleLowerCase().includes(normalized)
    )
  }, [books, query])

  const dropFiles = (files: FileList): void => {
    const paths = Array.from(files)
      .map((file) => window.readex.system.getPathForFile(file))
      .filter(Boolean)
    if (paths.length) void onImportPaths(paths)
  }

  return (
    <main
      className={`library-view ${dragActive ? 'dragging' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        if (event.dataTransfer.files.length) dropFiles(event.dataTransfer.files)
      }}
    >
      <header className="library-header">
        <div>
          <p className="eyebrow">个人图书库</p>
          <h1>全部书籍</h1>
          <p className="library-subtitle">
            {books.length
              ? `${books.length} 本书保存在 data/personal，完整离线可用`
              : '导入 EPUB、MOBI、PDF 或 TXT 开始阅读'}
          </p>
        </div>
        <button className="primary-button" type="button" disabled={importing} onClick={onImport}>
          <FilePlus2 size={17} />
          <span>{importing ? '正在导入' : '导入图书'}</span>
        </button>
      </header>

      {books.length > 0 && (
        <div className="library-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索书名、作者或格式"
            />
          </label>
          <span className="library-count">{filtered.length} 本</span>
        </div>
      )}

      {books.length === 0 ? (
        <section className="empty-library">
          <div className="empty-icon">
            <LibraryBig size={34} />
          </div>
          <h2>你的个人图书馆还是空的</h2>
          <p>将电子书拖到窗口任意位置，或从电脑中选择文件。原文件不会被移动。</p>
          <button className="primary-button" type="button" onClick={onImport}>
            <FilePlus2 size={17} />
            <span>选择电子书</span>
          </button>
          <div className="format-list">
            {['EPUB', 'MOBI / KF8', 'PDF', 'TXT'].map((format) => (
              <span key={format}>{format}</span>
            ))}
          </div>
        </section>
      ) : (
        <section className="book-grid">
          {filtered.map((book) => (
            <article className="book-card" key={book.id}>
              <button className="book-card-main" type="button" onClick={() => onOpenBook(book.id)}>
                <div className="book-cover">
                  {book.coverDataUrl ? (
                    <img src={book.coverDataUrl} alt="" />
                  ) : (
                    <div className="cover-fallback">
                      <BookOpen size={28} />
                      <strong>{book.title.slice(0, 24)}</strong>
                    </div>
                  )}
                  <span className="format-badge">{bookFormatLabel(book.format)}</span>
                </div>
                <div className="book-card-copy">
                  <h2 title={book.title}>{book.title}</h2>
                  <p>{book.author || '未知作者'}</p>
                  <div className="book-meta">
                    <span>{formatBytes(book.size)}</span>
                    <span>{formatDate(book.importedAt)}</span>
                  </div>
                </div>
              </button>
              <div className="book-progress" title={`阅读进度 ${formatPercent(book.progress)}`}>
                <span style={{ width: formatPercent(book.progress) }} />
              </div>
              <div className="book-actions">
                <button
                  type="button"
                  title="在资源管理器中显示"
                  onClick={() => onReveal(book.id)}
                >
                  <FolderSearch size={15} />
                </button>
                <button type="button" title="移除" onClick={() => onRemove(book)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {dragActive && (
        <div className="drop-overlay">
          <FilePlus2 size={36} />
          <strong>释放以导入电子书</strong>
          <span>支持 EPUB、MOBI、PDF、TXT</span>
        </div>
      )}
    </main>
  )
}
