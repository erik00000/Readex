import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ChapterProgress } from '@shared/types'

export interface MenuAction {
  label: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  danger?: boolean
  checked?: boolean
  onSelect: () => void
}

interface MenuGroup {
  label: string
  items: MenuAction[]
}

interface TitleBarProps {
  menus: MenuGroup[]
  bookTitle?: string
  bookProgress?: number | null
  chapterProgress?: ChapterProgress | null
  onBack?: () => void
}

export function TitleBar({
  menus,
  bookTitle,
  bookProgress,
  chapterProgress,
  onBack
}: TitleBarProps): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    const closeOnWindowBlur = (): void => setOpenIndex(null)

    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('blur', closeOnWindowBlur)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('blur', closeOnWindowBlur)
    }
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-leading">
        <button
          className="titlebar-nav-button no-drag"
          type="button"
          title="返回"
          disabled={!onBack}
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </button>
      </div>

      <nav
        className="menubar no-drag"
        ref={menuRef}
        aria-label="应用菜单"
        onMouseLeave={() => setOpenIndex(null)}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null
          if (!next || !event.currentTarget.contains(next)) setOpenIndex(null)
        }}
      >
        {menus.map((menu, index) => (
          <div className="menu-root" key={menu.label}>
            <button
              className={`menu-trigger ${openIndex === index ? 'active' : ''}`}
              type="button"
              aria-haspopup="menu"
              aria-expanded={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              onMouseEnter={() => openIndex !== null && setOpenIndex(index)}
            >
              {menu.label}
            </button>
            {openIndex === index && (
              <div className="menu-popover" role="menu">
                {menu.items.map((item, itemIndex) =>
                  item.separator ? (
                    <div className="menu-separator" key={`separator-${itemIndex}`} />
                  ) : (
                    <button
                      type="button"
                      className={`menu-item ${item.danger ? 'danger' : ''}`}
                      key={item.label}
                      disabled={item.disabled}
                      role="menuitem"
                      onClick={() => {
                        setOpenIndex(null)
                        item.onSelect()
                      }}
                    >
                      <span className="menu-check">{item.checked ? '✓' : ''}</span>
                      <span>{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="titlebar-spacer" />

      {(chapterProgress || (bookProgress !== null && bookProgress !== undefined)) && (
        <div
          className="titlebar-progress no-drag"
          title={
            chapterProgress
              ? `${chapterProgress.label} · ${chapterProgress.current}/${chapterProgress.total}`
              : bookTitle
          }
        >
          <div className="titlebar-progress-label">
            <span>{chapterProgress?.label || bookTitle || '阅读进度'}</span>
            <strong
              key={
                chapterProgress
                  ? `${bookProgress}-${chapterProgress.current}-${chapterProgress.total}`
                  : bookProgress
              }
            >
              {chapterProgress
                ? `${formatProgress(bookProgress ?? chapterProgress.percent / 100)} · ${chapterProgress.current}/${chapterProgress.total}`
                : formatProgress(bookProgress ?? 0)}
            </strong>
          </div>
          <div className="titlebar-progress-track">
            <span
              style={{
                width: formatProgressWidth(
                  bookProgress ?? (chapterProgress ? chapterProgress.percent / 100 : 0)
                )
              }}
            />
          </div>
        </div>
      )}

      <div className="titlebar-native-spacer" aria-hidden="true" />
    </header>
  )
}

function formatProgress(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`
}

function formatProgressWidth(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(2)}%`
}

export type { MenuGroup }
