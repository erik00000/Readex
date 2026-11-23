import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import type { OnlineCatalog, OnlineChapter, ReadingLocator, TocItem } from '@shared/types'
import { onlineSourceName } from '@shared/online'
import type { ReaderHandle, ReaderProps } from './types'
import { applyTextHighlights, clearTextHighlights, locatorFromSelection, scrollToTextOffset, textOffsetAtPoint } from '../lib/textAnchors'
import { normalizedWheelDelta, smoothScrollBy } from '../lib/smoothScroll'

export const OnlineReader = forwardRef<ReaderHandle, ReaderProps>(function OnlineReader(props, ref) {
  const { book, settings, annotations, onSelection, onReaderPointerDown, onTocChange, onError } = props
  const [catalog, setCatalog] = useState<OnlineCatalog | null>(null)
  const [chapter, setChapter] = useState<OnlineChapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLElement>(null)
  const state = useRef({ catalog, chapter, settings, props })
  state.current = { catalog, chapter, settings, props }
  const ticket = useRef(0)
  const alive = useRef(true)
  const progressTimer = useRef<number | null>(null)
  const pending = useRef<ReadingLocator | TocItem | null>(null)
  const restore = useRef<ReadingLocator | null>(null)
  const restoring = useRef(false)
  const lastWheel = useRef(0)
  const attempted = useRef<string | null>(null)
  const lastSaved = useRef<ReadingLocator | null>(null)

  const capture = (): void => {
    const current = state.current
    const root = rootRef.current
    const text = textRef.current
    if (!root || !text || !current.chapter || !current.catalog || restoring.current) return
    const index = current.catalog.chapters.findIndex((c) => c.id === current.chapter!.id)
    if (index < 0) return
    const max = Math.max(0, root.scrollHeight - root.clientHeight)
    const fraction = max ? Math.max(0, Math.min(1, root.scrollTop / max)) : 0
    const rect = text.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const start = textOffsetAtPoint(text, rect.left + rect.width / 2, rootRect.top + 12) ?? 0
    const locator: ReadingLocator = { type: 'text-offset', value: current.chapter.id, chapterId: current.chapter.id, chapterHref: current.chapter.url, start, chapterProgress: fraction }
    lastSaved.current = locator
    current.props.onProgress(locator, (index + fraction) / current.catalog.chapters.length)
  }
  const flush = (): void => {
    if (progressTimer.current !== null) { clearTimeout(progressTimer.current); progressTimer.current = null }
    capture()
    const current = state.current
    const locator = lastSaved.current
    if (!locator || !current.catalog) return
    const index = current.catalog.chapters.findIndex((c) => c.id === locator.chapterId)
    if (index >= 0) void window.readex.reading.saveState(book.id, locator, (index + (locator.chapterProgress ?? 0)) / current.catalog.chapters.length)
  }
  const report = (): void => {
    if (progressTimer.current !== null) clearTimeout(progressTimer.current)
    progressTimer.current = window.setTimeout(() => { progressTimer.current = null; capture() }, 160)
  }

  const loadChapter = async (id: string, locator?: ReadingLocator): Promise<void> => {
    if (!state.current.catalog) { pending.current = locator ?? { id, label: '', chapterId: id }; return }
    const target = state.current.catalog.chapters.find((c) => c.id === id)
    if (!target) { setError('章节不在目录中，请刷新目录'); return }
    flush()
    const current = ++ticket.current
    attempted.current = id
    setLoading(true); setError('')
    try {
      const result = await window.readex.online.chapter(book.id, id)
      if (!alive.current || current !== ticket.current) return
      restore.current = locator ?? { type: 'text-offset', value: id, chapterId: id, chapterProgress: 0 }
      restoring.current = true
      setChapter({ ...result, html: DOMPurify.sanitize(result.html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'img', 'a'] }) })
    } catch (e) { if (alive.current && current === ticket.current) setError(e instanceof Error ? e.message : '章节加载失败') }
    finally { if (alive.current && current === ticket.current) setLoading(false) }
  }
  const goTo = (target: ReadingLocator | TocItem): void => {
    if (!state.current.catalog) { pending.current = target; return }
    const id = target.chapterId || ('value' in target ? target.value : target.id)
    void loadChapter(id, 'type' in target ? target : undefined)
  }
  const adjacent = (direction: number): void => {
    const current = state.current
    if (!current.catalog || !current.chapter) return
    const index = current.catalog.chapters.findIndex((c) => c.id === current.chapter!.id)
    const target = current.catalog.chapters[index + direction]
    if (target) void loadChapter(target.id)
  }
  const move = (delta: number, forcePage = false): void => {
    const root = rootRef.current
    if (!root || restoring.current || loading) return
    state.current.props.onReaderPointerDown()
    if (forcePage || state.current.settings.readingMode === 'paged') {
      smoothScrollBy(root, Math.sign(delta) * Math.max(1, Math.floor(root.clientHeight * 0.88)), false)
    } else smoothScrollBy(root, delta, state.current.settings.smoothScrolling)
    report()
  }
  useImperativeHandle(ref, () => ({
    goTo, scrollBy: move,
    search: async () => { onError('在线书籍请使用目录查找章节，暂不支持全书正文搜索'); return [] },
    startAutoScroll: () => 'unavailable', stopAutoScroll: () => undefined,
    getSpeechSnapshot: () => null, scrollToSpeechSegment: () => undefined,
    setSpeechSegmentHighlight: () => undefined, advanceSpeechSection: async () => false
  }))

  useEffect(() => {
    alive.current = true
    let active = true
    void Promise.all([window.readex.online.catalog(book.id), window.readex.reading.getState(book.id)]).then(([value, saved]) => {
      if (!active) return
      state.current.catalog = value
      setCatalog(value)
      onTocChange(value.chapters.map((c) => ({ id: c.id, chapterId: c.id, label: c.label, href: c.url })))
      const target = pending.current ?? saved?.locator ?? book.lastLocation
      pending.current = null
      if (target) goTo(target)
      else void loadChapter(value.chapters[0].id)
    }).catch((e) => { if (active) { setLoading(false); setError(e instanceof Error ? e.message : '目录加载失败') } })
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      active = false; alive.current = false; ticket.current++; flush()
      window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush)
    }
  }, [book.id])

  useLayoutEffect(() => {
    if (!chapter || loading) return
    const token = ticket.current
    const target = restore.current
    const position = (): void => {
      const root = rootRef.current
      const text = textRef.current
      if (!root || !text || ticket.current !== token || !restoring.current) return
      if (typeof target?.chapterProgress === 'number') root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight) * Math.max(0, Math.min(1, target.chapterProgress))
      else if (target?.start) scrollToTextOffset(text, target.start, 'auto')
      else root.scrollTop = 0
      restoring.current = false; capture()
    }
    // Position only after the font is ready; never schedule later scroll corrections.
    const timer = window.setTimeout(position, 1500)
    void document.fonts.ready.then(() => { clearTimeout(timer); if (alive.current && restoring.current) position() })
    return () => clearTimeout(timer)
  }, [chapter, loading])

  useEffect(() => {
    const text = textRef.current
    if (!text || !chapter) return
    clearTextHighlights(text, annotations); applyTextHighlights(text, annotations)
    return () => clearTextHighlights(text, annotations)
  }, [annotations, chapter])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const wheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.ctrlKey) return
      event.preventDefault()
      if (state.current.settings.readingMode === 'paged') {
        const now = performance.now()
        if (now - lastWheel.current < 180) return
        lastWheel.current = now
        move(event.deltaY, true)
      } else move(normalizedWheelDelta(event.deltaY, event.deltaMode, state.current.settings.wheelScrollStep, root.clientHeight))
    }
    root.addEventListener('wheel', wheel, { passive: false })
    return () => root.removeEventListener('wheel', wheel)
  }, [loading])

  const refresh = async (): Promise<void> => {
    setRefreshing(true); setError('')
    try {
      const value = await window.readex.online.catalog(book.id, true)
      if (!alive.current) return
      setCatalog(value); state.current.catalog = value
      onTocChange(value.chapters.map((c) => ({ id: c.id, chapterId: c.id, label: c.label, href: c.url })))
      if (!chapter) void loadChapter(value.chapters[0].id)
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '目录更新失败') }
    finally { if (alive.current) setRefreshing(false) }
  }
  const index = catalog?.chapters.findIndex((c) => c.id === chapter?.id) ?? -1
  return <div className="online-reader">
    <div className="online-reader-bar">
      <span>{book.online ? onlineSourceName(book.online.source) : '在线阅读'} · {catalog?.chapters.length ?? 0} 章{chapter?.cached ? ' · 已缓存' : ''}</span>
      <button className="text-button" type="button" disabled={refreshing || loading} onClick={() => void refresh()}><RefreshCw size={14}/> {refreshing ? '更新中…' : '刷新目录'}</button>
      <button className="text-button" type="button" onClick={() => void window.readex.system.openExternal(chapter?.url ?? book.online!.url)}><ExternalLink size={14}/>原站</button>
    </div>
    {error && <div className="online-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={loading || refreshing} onClick={() => attempted.current ? void loadChapter(attempted.current) : void refresh()}>重试</button></div>}
    {loading && <div className="online-loading" role="status">正在加载章节…</div>}
    <div className="reader-scroll online-reader-scroll" ref={rootRef} onScroll={report} tabIndex={0}
      onKeyDown={(e) => { if (e.ctrlKey || e.metaKey || e.altKey || e.target !== e.currentTarget) return; if (e.key === 'PageDown' || e.key === 'PageUp' || e.key === ' ') { e.preventDefault(); move(e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) ? -1 : 1, true) } }}
      onPointerDown={() => { restoring.current = false; onReaderPointerDown() }} style={{ background: settings.backgroundColor }}>
      {chapter && <article className="reader-page" style={{ maxWidth: settings.contentWidth, color: settings.textColor, fontFamily: settings.fontFamily, fontSize: settings.fontSize, lineHeight: settings.lineHeight, letterSpacing: `${settings.letterSpacing}em` }}>
        <section ref={textRef} className="reader-chapter" dangerouslySetInnerHTML={{ __html: chapter.html }} onMouseUp={() => { const text = textRef.current; if (!text) return; const selected = locatorFromSelection(text, chapter.id, 'text-offset'); if (selected) onSelection(selected) }}/>
        <div className="online-chapter-nav"><button className="secondary-button" type="button" disabled={index <= 0 || loading} onClick={() => adjacent(-1)}><ChevronLeft size={16}/>上一章</button><span>{index + 1} / {catalog?.chapters.length}</span><button className="secondary-button" type="button" disabled={index >= (catalog?.chapters.length ?? 0) - 1 || loading} onClick={() => adjacent(1)}>下一章<ChevronRight size={16}/></button></div>
      </article>}
    </div>
    <div className="online-page-nav" aria-label="在线阅读翻页">
      <button className="secondary-button" type="button" disabled={!chapter || loading || index <= 0} onClick={() => adjacent(-1)}>上一章</button>
      <button className="secondary-button" type="button" disabled={!chapter || loading} onClick={() => move(-1, true)}>上一页</button>
      <span title={chapter?.label}>{chapter?.label ?? '在线阅读'}</span>
      <button className="secondary-button" type="button" disabled={!chapter || loading} onClick={() => move(1, true)}>下一页</button>
      <button className="secondary-button" type="button" disabled={!chapter || loading || index >= (catalog?.chapters.length ?? 0) - 1} onClick={() => adjacent(1)}>下一章</button>
    </div>
  </div>
})
