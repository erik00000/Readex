import { useMemo, useState } from 'react'
import { BookOpen, NotebookPen, Search } from 'lucide-react'
import type { Annotation, BookRecord } from '@shared/types'
import { ANNOTATION_COLORS } from '@shared/types'

interface NotesDashboardProps {
  books: BookRecord[]
  annotations: Annotation[]
  loading: boolean
  onOpenBook: (bookId: string, annotation: Annotation) => void
}

export function NotesDashboard({
  books,
  annotations,
  loading,
  onOpenBook
}: NotesDashboardProps): React.JSX.Element {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return annotations.filter((annotation) => {
      if (!normalized) return true
      return `${annotation.text} ${annotation.note}`.toLocaleLowerCase().includes(normalized)
    })
  }, [annotations, query])

  return (
    <main className="notes-dashboard">
      <header>
        <p className="eyebrow">本地知识库</p>
        <h1>所有笔记</h1>
        <p>{annotations.length} 条高亮与批注，数据仅保存在 personal 目录</p>
      </header>
      <label className="search-field dashboard-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索摘录和批注"
        />
      </label>
      {loading ? (
        <section className="empty-notes">
          <NotebookPen size={32} />
          <h2>正在加载笔记</h2>
          <p>只读取 local personal 目录中的批注数据。</p>
        </section>
      ) : results.length === 0 ? (
        <section className="empty-notes">
          <NotebookPen size={32} />
          <h2>{annotations.length ? '没有匹配的笔记' : '还没有笔记'}</h2>
          <p>打开一本书，选中文字即可开始高亮和批注。</p>
        </section>
      ) : (
        <section className="global-note-list">
          {results.map((annotation) => {
            const book = books.find((item) => item.id === annotation.bookId)
            return (
              <article key={annotation.id}>
                <button type="button" onClick={() => onOpenBook(annotation.bookId, annotation)}>
                  <span
                    className="annotation-color"
                    style={{ background: ANNOTATION_COLORS[annotation.color] }}
                  />
                  <span className="global-note-copy">
                    <strong>{annotation.text}</strong>
                    {annotation.note && <span>{annotation.note}</span>}
                    <small>
                      <BookOpen size={13} />
                      {book?.title ?? '未知书籍'} · {new Date(annotation.createdAt).toLocaleDateString('zh-CN')}
                    </small>
                  </span>
                </button>
              </article>
            )
          })}
        </section>
      )}
    </main>
  )
}
