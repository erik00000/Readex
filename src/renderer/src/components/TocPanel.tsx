import { useEffect, useRef } from 'react'
import { ChevronRight, ListTree } from 'lucide-react'
import type { TocItem } from '@shared/types'

interface TocPanelProps {
  items: TocItem[]
  activeId?: string
  onSelect: (item: TocItem) => void
}

export function TocPanel({
  items,
  activeId,
  onSelect
}: TocPanelProps): React.JSX.Element {
  return (
    <div className="side-panel-content">
      <div className="panel-title">
        <ListTree size={16} />
        <span>目录</span>
      </div>
      {items.length === 0 ? (
        <div className="panel-empty">这本书没有可用的目录信息</div>
      ) : (
        <div className="toc-tree">
          {items.map((item) => (
            <TocNode
              activeId={activeId}
              item={item}
              key={item.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TocNode({
  item,
  activeId,
  onSelect,
  depth = 0
}: {
  item: TocItem
  activeId?: string
  onSelect: (item: TocItem) => void
  depth?: number
}): React.JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const active = item.id === activeId

  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  return (
    <div className="toc-node">
      <button
        type="button"
        className={active ? 'active' : undefined}
        aria-current={active ? 'location' : undefined}
        ref={buttonRef}
        onClick={() => onSelect(item)}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {item.children?.length ? <ChevronRight size={13} /> : <span className="toc-dot" />}
        <span>{item.label}</span>
      </button>
      {item.children?.map((child) => (
        <TocNode
          activeId={activeId}
          item={child}
          key={child.id}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}
