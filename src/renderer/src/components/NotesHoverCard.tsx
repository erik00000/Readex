import { ArrowRight, NotebookPen } from 'lucide-react'
import type { Annotation } from '@shared/types'
import { ANNOTATION_COLORS } from '@shared/types'

interface NotesHoverCardProps {
  annotations: Annotation[]
  onSelect: (annotation: Annotation) => void
  onOpenAll: () => void
}

export function NotesHoverCard({
  annotations,
  onSelect,
  onOpenAll
}: NotesHoverCardProps): React.JSX.Element {
  const sorted = [...annotations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="notes-hover-card" role="dialog" aria-label="本书笔记">
      <div className="notes-hover-header">
        <span>
          <NotebookPen size={15} />
          本书笔记
        </span>
        <strong>{annotations.length}</strong>
        <button type="button" onClick={onOpenAll}>
          全部笔记
          <ArrowRight size={13} />
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="notes-hover-empty">
          <NotebookPen size={18} />
          <span>还没有笔记</span>
          <small>选中正文后添加笔记</small>
        </div>
      ) : (
        <div className="notes-hover-list">
          {sorted.map((annotation) => (
            <button
              className="notes-hover-item"
              type="button"
              key={annotation.id}
              onClick={() => onSelect(annotation)}
            >
              <span
                className="notes-hover-color"
                style={{ background: ANNOTATION_COLORS[annotation.color] }}
              />
              <span className="notes-hover-copy">
                {annotation.type === 'bookmark' && (
                  <small className="notes-hover-kind">书签</small>
                )}
                <strong>{annotation.note || annotation.text}</strong>
                {annotation.note && <span>{annotation.text}</span>}
                <time>{new Date(annotation.createdAt).toLocaleString('zh-CN')}</time>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
