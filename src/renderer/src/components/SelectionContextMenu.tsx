import { useLayoutEffect, useRef, useState } from 'react'
import { BookmarkPlus, Copy, Highlighter, MessageSquarePlus } from 'lucide-react'
import type { AnnotationColor } from '@shared/types'
import { ANNOTATION_COLORS } from '@shared/types'

interface SelectionContextMenuProps {
  x: number
  y: number
  onAddNote: () => void
  onCopy: () => void
  onBookmark: () => void
  onHighlight: (color: AnnotationColor) => void
  onClose: () => void
}

export function SelectionContextMenu({
  x,
  y,
  onAddNote,
  onCopy,
  onBookmark,
  onHighlight,
  onClose
}: SelectionContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const updatePosition = (): void => {
      const { width, height } = menu.getBoundingClientRect()
      const next = getFloatingMenuPosition({
        x,
        y,
        width,
        height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      })
      setPosition({ ...next, ready: true })
    }
    updatePosition()
    menu.focus({ preventScroll: true })
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [x, y])

  return (
    <div
      className="selection-context-menu"
      ref={menuRef}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? 'visible' : 'hidden'
      }}
      role="menu"
      tabIndex={-1}
      aria-label="文本操作"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className="context-menu-heading">
        <span>
          <Highlighter size={14} />
          文本操作
        </span>
      </div>
      <div className="context-color-row">
        {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((color) => (
          <button
            type="button"
            key={color}
            title={`高亮 ${color}`}
            onClick={() => onHighlight(color)}
          >
            <i style={{ background: ANNOTATION_COLORS[color] }} />
          </button>
        ))}
      </div>
      <div className="context-menu-separator" />
      <button className="context-menu-item" type="button" role="menuitem" onClick={onAddNote}>
        <MessageSquarePlus size={16} />
        <span>添加笔记</span>
        <kbd>N</kbd>
      </button>
      <button className="context-menu-item" type="button" role="menuitem" onClick={onCopy}>
        <Copy size={16} />
        <span>复制</span>
        <kbd>Ctrl+C</kbd>
      </button>
      <button className="context-menu-item" type="button" role="menuitem" onClick={onBookmark}>
        <BookmarkPlus size={16} />
        <span>添加书签</span>
        <kbd>B</kbd>
      </button>
    </div>
  )
}

export function getFloatingMenuPosition({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = 8,
  gap = 2
}: {
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
  gap?: number
}): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)
  const openToLeft = x + width + margin > viewportWidth
  const openAbove = y + height + margin > viewportHeight
  const preferredLeft = openToLeft ? x - width + gap : x
  const preferredTop = openAbove ? y - height + gap : y

  return {
    left: Math.max(margin, Math.min(preferredLeft, maxLeft)),
    top: Math.max(margin, Math.min(preferredTop, maxTop))
  }
}
