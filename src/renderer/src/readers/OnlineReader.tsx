import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import type { OnlineCatalog, OnlineChapter, ReadingLocator, TocItem } from '@shared/types'
import { onlineSourceName } from '@shared/online'
import type { AutoScrollStatus, ReaderHandle, ReaderProps } from './types'
import { applyTextHighlights, clearTextHighlights, locatorFromSelection, scrollToTextOffset, textOffsetAtPoint } from '../lib/textAnchors'
import { normalizedWheelDelta, smoothScrollBy } from '../lib/smoothScroll'
import { AutoScrollController } from '../lib/autoScroll'
import { isLightColor } from '../lib/theme'
import { buildSpeechSnapshot, removeSpeechHighlight, scrollRangeToReadingPosition, setSpeechHighlight } from '../lib/speech'

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
  const busy = useRef(true)
  const previousTypography = useRef({ fontSize: settings.fontSize, fontFamily: settings.fontFamily, lineHeight: settings.lineHeight, contentWidth: settings.contentWidth, letterSpacing: settings.letterSpacing })
  const autoRunning = useRef(false)
  const autoController = useRef<AutoScrollController | null>(null)
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const positionWaiter = useRef<{ token: number; resolve: (ready: boolean) => void } | null>(null)
  const speechSegments = useRef(new Map<string, Range>())

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
    if (progressTimer.current !== null) return
    progressTimer.current = window.setTimeout(() => { progressTimer.current = null; capture() }, 160)
  }

  const loadChapter = async (id: string, locator?: ReadingLocator): Promise<boolean> => {
    if (!state.current.catalog) { pending.current = locator ?? { id, label: '', chapterId: id }; return false }
    const target = state.current.catalog.chapters.find((c) => c.id === id)
    if (!target) { setError('章节不在目录中，请刷新目录'); return false }
    positionWaiter.current?.resolve(false)
    positionWaiter.current = null
    flush()
    autoController.current?.stop()
    speechSegments.current.clear()
    removeSpeechHighlight()
    busy.current = true
    const current = ++ticket.current
    attempted.current = id
    setLoading(true); setError('')
    try {
      const result = await window.readex.online.chapter(book.id, id)
      if (!alive.current || current !== ticket.current) return false
      const positioned = new Promise<boolean>((resolve) => { positionWaiter.current = { token: current, resolve } })
      restore.current = locator ?? { type: 'text-offset', value: id, chapterId: id, chapterProgress: 0 }
      restoring.current = true
      setChapter({ ...result, html: DOMPurify.sanitize(result.html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'img', 'a'] }) })
      return positioned
    } catch (e) {
      if (alive.current && current === ticket.current) setError(e instanceof Error ? e.message : '章节加载失败')
      return false
    } finally { if (alive.current && current === ticket.current) { busy.current = false; setLoading(false) } }
  }
  const goTo = (target: ReadingLocator | TocItem): void => {
    if (!state.current.catalog) { pending.current = target; return }
    state.current.props.onReaderPointerDown()
    const id = target.chapterId || ('value' in target ? target.value : target.id)
    void loadChapter(id, 'type' in target ? target : undefined)
  }
  const adjacent = (direction: number): void => {
    const current = state.current
    if (!current.catalog || !current.chapter) return
    const index = current.catalog.chapters.findIndex((c) => c.id === current.chapter!.id)
    const target = current.catalog.chapters[index + direction]
    if (target) { state.current.props.onReaderPointerDown(); void loadChapter(target.id) }
  }
  const move = (delta: number, forcePage = false): void => {
    const root = rootRef.current
    if (!root || restoring.current || busy.current) return
    state.current.props.onReaderPointerDown()
    if (forcePage || state.current.settings.readingMode === 'paged') {
      const max = Math.max(0, root.scrollHeight - root.clientHeight)
      const direction = Math.sign(delta)
      const current = state.current
      if ((direction > 0 && root.scrollTop >= max - 1) || (direction < 0 && root.scrollTop <= 1)) {
        const index = current.catalog?.chapters.findIndex((c) => c.id === current.chapter?.id) ?? -1
        const target = index >= 0 ? current.catalog?.chapters[index + direction] : undefined
        if (target) void loadChapter(target.id, { type: 'text-offset', value: target.id, chapterId: target.id, chapterProgress: direction < 0 ? 1 : 0 })
        return
      }
      smoothScrollBy(root, Math.sign(delta) * Math.max(1, Math.floor(root.clientHeight * 0.88)), false)
    } else smoothScrollBy(root, delta, state.current.settings.smoothScrolling)
    report()
  }
  const nextChapter = (): OnlineCatalog['chapters'][number] | undefined => {
    const current = state.current
    const index = current.catalog?.chapters.findIndex((c) => c.id === current.chapter?.id) ?? -1
    return index >= 0 ? current.catalog?.chapters[index + 1] : undefined
  }
  const stopAutoScroll = (): void => {
    autoRunning.current = false
    if (autoNextTimer.current !== null) { clearTimeout(autoNextTimer.current); autoNextTimer.current = null }
    autoController.current?.stop()
  }
  const continueAutoScroll = async (): Promise<void> => {
    if (!autoRunning.current || !alive.current) return
    const next = nextChapter()
    if (!next) { stopAutoScroll(); state.current.props.onAutoScrollEnd?.(); return }
    const ready = await loadChapter(next.id)
    if (!autoRunning.current || !alive.current) return
    if (!ready) {
      stopAutoScroll(); state.current.props.onAutoScrollEnd?.()
      state.current.props.onError('下一章加载失败，自动滚动已暂停，请重试')
      return
    }
    beginAutoScroll()
  }
  const ensureAutoController = (): AutoScrollController => {
    if (!autoController.current) autoController.current = new AutoScrollController({
      getContainer: () => rootRef.current,
      getRoots: () => {
        const root = rootRef.current, text = textRef.current
        if (!root || !text) return []
        return [{ el: text, document: text.ownerDocument, highlightHost: text,
          mapY: (y: number) => y - root.getBoundingClientRect().top + root.scrollTop }]
      },
      getSpeed: () => state.current.settings.autoScrollSpeed,
      getHighlightColor: () => state.current.settings.autoScrollColor,
      isLightBackground: () => isLightColor(state.current.settings.backgroundColor),
      isHighlightEnabled: () => state.current.settings.autoScrollHighlight,
      getHighlightStyle: () => state.current.settings.autoScrollHighlightStyle,
      getBandHost: () => rootRef.current?.parentElement ?? null,
      getBandRect: () => {
        const rect = textRef.current?.getBoundingClientRect()
        return rect ? { left: rect.left, width: rect.width } : null
      },
      onEnd: () => { void continueAutoScroll() }
    })
    return autoController.current
  }
  const beginAutoScroll = (): AutoScrollStatus => {
    const result = ensureAutoController().start()
    if (result === 'end' && nextChapter()) {
      // Give an entirely visible short chapter time on screen before continuing.
      autoNextTimer.current = setTimeout(() => { autoNextTimer.current = null; void continueAutoScroll() }, 3000)
      return 'started'
    }
    if (result !== 'started') { stopAutoScroll(); state.current.props.onAutoScrollEnd?.() }
    return result
  }
  const startAutoScroll = (): AutoScrollStatus => {
    if (busy.current || restoring.current || !state.current.chapter) return 'unavailable'
    stopAutoScroll()
    autoRunning.current = true
    return beginAutoScroll()
  }
  const getSpeechSnapshot = (): ReturnType<ReaderHandle['getSpeechSnapshot']> => {
    const root = rootRef.current, text = textRef.current, current = state.current.chapter
    if (!root || !text || !current || busy.current || restoring.current) return null
    const snapshot = buildSpeechSnapshot([{ id: current.id, element: text,
      mapY: (y) => y - root.getBoundingClientRect().top + root.scrollTop }], root.scrollTop)
    speechSegments.current = new Map(snapshot?.segments.map((segment) => [segment.id, segment.range]) ?? [])
    return snapshot
  }
  useImperativeHandle(ref, () => ({
    goTo, scrollBy: move, turnPage: (direction) => move(direction, true),
    search: async () => { onError('在线书籍请使用目录查找章节，暂不支持全书正文搜索'); return [] },
    startAutoScroll, stopAutoScroll, getSpeechSnapshot,
    scrollToSpeechSegment: (id) => {
      const range = speechSegments.current.get(id), root = rootRef.current
      if (range && root) scrollRangeToReadingPosition(range, root, state.current.settings.smoothScrolling)
    },
    setSpeechSegmentHighlight: (id) => setSpeechHighlight(id ? speechSegments.current.get(id) ?? null : null, state.current.settings.autoScrollColor),
    advanceSpeechSection: async () => {
      const next = nextChapter()
      return next ? loadChapter(next.id) : false
    }
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
      active = false; alive.current = false; ticket.current++; stopAutoScroll(); flush()
      positionWaiter.current?.resolve(false); positionWaiter.current = null
      removeSpeechHighlight()
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
      if (positionWaiter.current?.token === token) { positionWaiter.current.resolve(true); positionWaiter.current = null }
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

  // Preserve the chapter position when the same reader is resized into a phone
  // window or its type size changes; this never runs on ordinary scroll events.
  const preserveLayoutPosition = (): void => {
    const root = rootRef.current, saved = lastSaved.current
    if (!root || !saved || busy.current || restoring.current || saved.chapterId !== state.current.chapter?.id || typeof saved.chapterProgress !== 'number') return
    root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight) * saved.chapterProgress
    capture()
  }
  useLayoutEffect(() => {
    const next = { fontSize: settings.fontSize, fontFamily: settings.fontFamily, lineHeight: settings.lineHeight, contentWidth: settings.contentWidth, letterSpacing: settings.letterSpacing }
    if (JSON.stringify(next) !== JSON.stringify(previousTypography.current)) preserveLayoutPosition()
    previousTypography.current = next
  }, [settings.fontSize, settings.fontFamily, settings.lineHeight, settings.contentWidth, settings.letterSpacing])
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    let width = root.clientWidth, height = root.clientHeight
    const observer = new ResizeObserver(() => {
      if (width === root.clientWidth && height === root.clientHeight) return
      width = root.clientWidth; height = root.clientHeight
      preserveLayoutPosition()
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

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
      onPointerDown={() => { restoring.current = false; positionWaiter.current?.resolve(true); positionWaiter.current = null; onReaderPointerDown() }} style={{ background: settings.backgroundColor }}>
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
