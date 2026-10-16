import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import DOMPurify from 'dompurify'
import type { BookContent, ReadingLocator, SearchResult, TocItem } from '@shared/types'
import type { ReaderHandle, ReaderProps } from './types'
import type { AutoScrollStatus } from './types'
import {
  applyTextHighlights,
  clearTextHighlights,
  locatorFromSelection,
  scrollToTextOffset,
  textOffsetAtPoint
} from '../lib/textAnchors'
import { AutoScrollController } from '../lib/autoScroll'
import {
  buildSpeechSnapshot,
  removeSpeechHighlight,
  scrollRangeToReadingPosition,
  setSpeechHighlight
} from '../lib/speech'
import { isLightColor } from '../lib/theme'
import { normalizedWheelDelta, smoothScrollBy } from '../lib/smoothScroll'

interface TextFlowReaderProps extends ReaderProps {
  format: 'mobi' | 'txt'
}

export const TextFlowReader = forwardRef<ReaderHandle, TextFlowReaderProps>(
  function TextFlowReader(
    {
      book,
      settings,
      annotations,
      onSelection,
      onReaderPointerDown,
      onOpenAnnotation,
      onProgress,
      onTocChange,
      onError,
      onAutoScrollEnd,
      format
    },
    ref
  ): React.JSX.Element {
    const [content, setContent] = useState<BookContent | null>(null)
    const [loading, setLoading] = useState(true)
    const scrollRef = useRef<HTMLDivElement>(null)
    const chapterRefs = useRef(new Map<string, HTMLElement>())
    const chapterEntries = useRef<Array<[string, HTMLElement]>>([])
    const speechSegments = useRef(new Map<string, Range>())
    const pendingLocator = useRef<Parameters<ReaderHandle['goTo']>[0] | null>(null)
    const navigationTarget = useRef<{
      locator: ReadingLocator
      timers: number[]
    } | null>(null)
    const progressFrame = useRef<number | null>(null)
    const lastChapterId = useRef<string | null>(null)
    const lastChapterStart = useRef(0)
    const lastPageTurnAt = useRef(0)
    const settingsRef = useRef(settings)
    const autoScrollControllerRef = useRef<AutoScrollController | null>(null)
    const autoScrollEndHandler = useRef<(() => void) | null>(null)

    useEffect(() => {
      autoScrollEndHandler.current = onAutoScrollEnd ?? null
    }, [onAutoScrollEnd])

    useEffect(() => {
      settingsRef.current = settings
    }, [settings])

    useEffect(() => {
      return () => {
        if (progressFrame.current !== null) {
          window.cancelAnimationFrame(progressFrame.current)
        }
      }
    }, [])

    useEffect(() => {
      let active = true
      setLoading(true)
      void window.readex.book
        .getContent(book.id)
        .then((value) => {
          if (!active) return
          if (!value) throw new Error('无法读取书籍内容')
          setContent(value)
          onTocChange(
            format === 'txt'
              ? value.toc.map((item) => ({ ...item, chapterId: item.chapterId ?? item.id }))
              : value.toc
          )
        })
        .catch((error) => onError(error instanceof Error ? error.message : '书籍内容读取失败'))
        .finally(() => active && setLoading(false))

      return () => {
        active = false
      }
    }, [book.id, onError, onTocChange])

    const safeChapters = useMemo(
      () =>
        (content?.chapters ?? []).map((chapter) => ({
          ...chapter,
          html: DOMPurify.sanitize(chapter.html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick']
          })
        })),
      [content]
    )

    useEffect(() => {
      const roots = [...chapterRefs.current.values()]
      for (const root of roots) clearTextHighlights(root, annotations)
      for (const root of roots) applyTextHighlights(root, annotations)
      return () => {
        for (const root of roots) clearTextHighlights(root, annotations)
      }
    }, [annotations, safeChapters])

    useEffect(() => {
      if (!content || loading) return
      void window.readex.reading.getState(book.id).then((state) => {
        if (state?.locator) pendingLocator.current = state.locator
        if (pendingLocator.current) {
          goTo(pendingLocator.current)
        } else if (state && Number.isFinite(state.progress)) {
          window.setTimeout(() => {
            const current = scrollRef.current
            if (!current) return
            const max = Math.max(0, current.scrollHeight - current.clientHeight)
            current.scrollTo({
              top: Math.max(0, Math.min(1, state.progress)) * max,
              behavior: 'auto'
            })
          }, 900)
        }
      })
      // Initial positioning only; later navigation is driven by the imperative API.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id, content, loading])

    useEffect(() => {
      const root = scrollRef.current
      if (!root || loading) return
      const onWheel = (event: WheelEvent): void => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
        event.preventDefault()
        navigationTarget.current?.timers.forEach((timer) => window.clearTimeout(timer))
        navigationTarget.current = null
        onReaderPointerDown()
        const current = settingsRef.current
        if (current.readingMode === 'paged') {
          const now = performance.now()
          if (now - lastPageTurnAt.current < 140) return
          lastPageTurnAt.current = now
          const page = Math.max(1, Math.floor(root.clientHeight * 0.88))
          const max = Math.max(0, root.scrollHeight - root.clientHeight)
          root.scrollTo({
            top: Math.max(0, Math.min(max, root.scrollTop + Math.sign(event.deltaY) * page)),
            behavior: 'auto'
          })
          return
        }
        const delta = normalizedWheelDelta(
          event.deltaY,
          event.deltaMode,
          current.wheelScrollStep,
          root.clientHeight
        )
        smoothScrollBy(root, delta, current.smoothScrolling)
      }
      const onPointerDown = (): void => {
        navigationTarget.current?.timers.forEach((timer) => window.clearTimeout(timer))
        navigationTarget.current = null
        onReaderPointerDown()
      }
      const onKeyDown = (): void => {
        navigationTarget.current?.timers.forEach((timer) => window.clearTimeout(timer))
        navigationTarget.current = null
      }
      root.addEventListener('wheel', onWheel, { passive: false })
      root.addEventListener('pointerdown', onPointerDown)
      root.addEventListener('keydown', onKeyDown)
      return () => {
        root.removeEventListener('wheel', onWheel)
        root.removeEventListener('pointerdown', onPointerDown)
        root.removeEventListener('keydown', onKeyDown)
      }
    }, [loading, onReaderPointerDown])

    const goTo = (target: Parameters<ReaderHandle['goTo']>[0]): void => {
      const chapterId =
        'chapterId' in target && target.chapterId
          ? target.chapterId
          : 'id' in target && target.id.startsWith('txt-')
            ? target.id
            : 'value' in target && target.type === 'text-offset' && target.value.startsWith('txt-')
              ? target.value.split(':', 1)[0]
              : undefined
      const start = 'start' in target ? target.start : undefined
      const scrollRoot = scrollRef.current
      if (!scrollRoot) {
        pendingLocator.current = target
        return
      }

      if (chapterId) {
        const resolvedChapterId = resolveChapterId(chapterId, safeChapters)
        const chapter = resolvedChapterId
          ? chapterRefs.current.get(resolvedChapterId)
          : undefined
        if (resolvedChapterId && chapter) {
          // A TOC click is a direct navigation request. Smooth scrolling emits
          // intermediate scroll events, and those events can save a transient
          // chapter as the new reading position before the animation finishes.
          const locator: ReadingLocator = {
            type: format === 'mobi' ? 'mobi-offset' : 'text-offset',
            value: resolvedChapterId,
            chapterId: resolvedChapterId,
            start: start ?? 0
          }

          const previousNavigation = navigationTarget.current
          previousNavigation?.timers.forEach((timer) => window.clearTimeout(timer))
          const navigation = { locator, timers: [] as number[] }
          navigationTarget.current = navigation

          const settle = (): void => {
            if (navigationTarget.current !== navigation) return
            const rootRect = scrollRoot.getBoundingClientRect()
            const chapterRect = chapter.getBoundingClientRect()
            const top = scrollRoot.scrollTop + chapterRect.top - rootRect.top
            scrollRoot.scrollTo({ top, behavior: 'auto' })
            const max = Math.max(1, scrollRoot.scrollHeight - scrollRoot.clientHeight)
            const nextProgress = Math.max(0, Math.min(1, top / max))
            onProgress(locator, nextProgress)
            void window.readex.reading.saveState(book.id, locator, nextProgress)
            if (start !== undefined) {
              window.setTimeout(() => {
                if (navigationTarget.current === navigation) {
                  scrollToTextOffset(chapter, start, 'auto')
                }
              }, 0)
            }
          }

          // Font loading and layout recalculation can move a distant chapter
          // after the first scroll. Recalculate its real position several
          // times, including after document fonts settle.
          settle()
          for (const delay of [50, 180, 450, 900]) {
            navigation.timers.push(window.setTimeout(settle, delay))
          }
          navigation.timers.push(
            window.setTimeout(() => {
              if (navigationTarget.current === navigation) {
                navigationTarget.current = null
              }
            }, 1100)
          )
          void document.fonts?.ready.then(settle)
          return
        }
      }

      if ('href' in target && target.href) {
        pendingLocator.current = target
      }
    }

    const search = async (query: string): Promise<SearchResult[]> => {
      return window.readex.search.inBook(book.id, query)
    }

    const scrollBy = (delta: number): void => {
      const root = scrollRef.current
      if (root) {
        navigationTarget.current?.timers.forEach((timer) => window.clearTimeout(timer))
        navigationTarget.current = null
        const current = settingsRef.current
        if (current.readingMode === 'paged') {
          const page = Math.max(1, Math.floor(root.clientHeight * 0.88))
          const max = Math.max(0, root.scrollHeight - root.clientHeight)
          root.scrollTo({
            top: Math.max(0, Math.min(max, root.scrollTop + Math.sign(delta) * page)),
            behavior: 'auto'
          })
          return
        }
        smoothScrollBy(root, delta, current.smoothScrolling)
      }
    }

    const ensureAutoScrollController = (): AutoScrollController => {
      if (!autoScrollControllerRef.current) {
        autoScrollControllerRef.current = new AutoScrollController({
          getContainer: () => scrollRef.current,
          getRoots: () => {
            const root = scrollRef.current
            if (!root) return []
            const rootRect = root.getBoundingClientRect()
            return [...chapterRefs.current.values()].map((chapter) => ({
              el: chapter,
              document: chapter.ownerDocument,
              highlightHost: chapter,
              mapY: (viewportY: number): number =>
                viewportY - rootRect.top + root.scrollTop
            }))
          },
          getSpeed: () => settingsRef.current.autoScrollSpeed,
          getHighlightColor: () => settingsRef.current.autoScrollColor,
          isLightBackground: () => isLightColor(settingsRef.current.backgroundColor),
          isHighlightEnabled: () => settingsRef.current.autoScrollHighlight,
          getHighlightStyle: () => settingsRef.current.autoScrollHighlightStyle,
          getBandHost: () => scrollRef.current?.parentElement ?? null,
          getBandRect: () => {
            const page = scrollRef.current?.querySelector('.reader-page')
            const rect = page?.getBoundingClientRect()
            return rect ? { left: rect.left, width: rect.width } : null
          },
          onEnd: () => autoScrollEndHandler.current?.()
        })
      }
      return autoScrollControllerRef.current
    }

    const startAutoScroll = (): AutoScrollStatus => {
      navigationTarget.current?.timers.forEach((timer) => window.clearTimeout(timer))
      navigationTarget.current = null
      return ensureAutoScrollController().start()
    }

    const stopAutoScroll = (): void => {
      autoScrollControllerRef.current?.stop()
    }

    const getSpeechSnapshot = (): ReturnType<ReaderHandle['getSpeechSnapshot']> => {
      const container = scrollRef.current
      if (!container) return null
      const rootRect = container.getBoundingClientRect()
      const snapshot = buildSpeechSnapshot(
        [...chapterRefs.current.entries()].map(([id, element]) => ({
          id,
          element,
          mapY: (viewportY: number): number =>
            viewportY - rootRect.top + container.scrollTop
        })),
        container.scrollTop
      )
      speechSegments.current = new Map(
        snapshot?.segments.map((segment) => [segment.id, segment.range]) ?? []
      )
      return snapshot
    }

    const scrollToSpeechSegment = (segmentId: string): void => {
      const container = scrollRef.current
      const range = speechSegments.current.get(segmentId)
      if (!container || !range) return
      scrollRangeToReadingPosition(
        range,
        container,
        settingsRef.current.smoothScrolling
      )
    }

    const setSpeechSegmentHighlight = (segmentId: string | null): void => {
      const range = segmentId ? speechSegments.current.get(segmentId) : null
      setSpeechHighlight(range ?? null, settingsRef.current.autoScrollColor)
    }

    const advanceSpeechSection = async (): Promise<boolean> => false

    useImperativeHandle(ref, () => ({
      goTo,
      scrollBy,
      search,
      startAutoScroll,
      stopAutoScroll,
      getSpeechSnapshot,
      scrollToSpeechSegment,
      setSpeechSegmentHighlight,
      advanceSpeechSection
    }))

    useEffect(() => removeSpeechHighlight, [book.id])

    const reportProgress = (): void => {
      if (progressFrame.current !== null) return
      progressFrame.current = window.requestAnimationFrame(() => {
        progressFrame.current = null
        const root = scrollRef.current
        if (!root || !content) return
        const max = Math.max(1, root.scrollHeight - root.clientHeight)
        const progress = Math.max(0, Math.min(1, root.scrollTop / max))
        if (navigationTarget.current) {
          onProgress(navigationTarget.current.locator, progress)
          return
        }
        const visibleChapter = findVisibleChapter(root, chapterEntries.current)
        const chapterId = visibleChapter?.id ?? null
        if (chapterId !== lastChapterId.current) {
          lastChapterId.current = chapterId
          lastChapterStart.current = chapterId
            ? findVisibleChapterStart(root, chapterRefs.current, chapterId)
            : 0
        }
        onProgress(
          {
            type: format === 'mobi' ? 'mobi-offset' : 'text-offset',
            value: chapterId ?? 'start',
            chapterId: chapterId ?? undefined,
            start: lastChapterStart.current
          },
          progress
        )
      })
    }

    if (loading) {
      return <ReaderLoading label={`正在解析 ${format.toUpperCase()} 内容`} />
    }

    if (!content) {
      return <ReaderError message="书籍内容加载失败" />
    }

    return (
      <div
        className={`reader-scroll text-flow-reader theme-${settings.theme}`}
        ref={scrollRef}
        onScroll={reportProgress}
        style={{ background: settings.backgroundColor }}
      >
        <article
          className="reader-page"
          data-floating-reader-content=""
          style={{
            maxWidth: settings.contentWidth,
            color: settings.textColor,
            fontFamily: settings.fontFamily,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
            letterSpacing: `${settings.letterSpacing}em`
          }}
        >
          {safeChapters.map((chapter) => (
            <section
              className="reader-chapter"
              id={`chapter-${chapter.id}`}
              key={chapter.id}
              ref={(element) => {
                if (element) chapterRefs.current.set(chapter.id, element)
                else chapterRefs.current.delete(chapter.id)
                chapterEntries.current = [...chapterRefs.current.entries()]
              }}
              onMouseUp={() => {
                const root = chapterRefs.current.get(chapter.id)
                if (!root) return
                const selection = locatorFromSelection(
                  root,
                  chapter.id,
                  format === 'mobi' ? 'mobi-offset' : 'text-offset'
                )
                if (selection) onSelection(selection)
              }}
              dangerouslySetInnerHTML={{ __html: chapter.html }}
            />
          ))}
        </article>
      </div>
    )
  }
)

function findVisibleChapterStart(
  scrollRoot: HTMLElement,
  chapters: Map<string, HTMLElement>,
  chapterId: string
): number {
  const chapter = chapters.get(chapterId)
  if (!chapter) return 0

  const rootRect = scrollRoot.getBoundingClientRect()
  const chapterRect = chapter.getBoundingClientRect()
  const top = Math.max(rootRect.top + 8, chapterRect.top + 8)
  const bottom = Math.min(rootRect.bottom - 8, chapterRect.bottom - 1)
  if (top > bottom) return 0
  const yCandidates = [
    Math.min(bottom, Math.max(top, rootRect.top + rootRect.height * 0.3)),
    Math.min(bottom, Math.max(top, rootRect.top + rootRect.height * 0.45)),
    Math.min(bottom, Math.max(top, rootRect.top + rootRect.height * 0.6))
  ]
  const xCandidates = [
    rootRect.left + rootRect.width / 2,
    rootRect.left + Math.min(48, rootRect.width / 2),
    rootRect.right - Math.min(48, rootRect.width / 2)
  ]
  for (const y of yCandidates) {
    for (const x of xCandidates) {
      const offset = textOffsetAtPoint(chapter, x, y)
      if (offset !== null) return offset
    }
  }
  return 0
}

function resolveChapterId(
  chapterId: string,
  chapters: Array<{ id: string }>
): string | undefined {
  if (chapters.some((chapter) => chapter.id === chapterId)) return chapterId
  const legacy = /^txt-(\d+)$/.exec(chapterId)
  if (!legacy) return undefined
  return chapters[Number(legacy[1]) - 1]?.id
}

function findVisibleChapter(
  scrollRoot: HTMLElement,
  chapters: Array<[string, HTMLElement]>
): { id: string } | null {
  const rootRect = scrollRoot.getBoundingClientRect()
  const readingTop = scrollRoot.scrollTop + Math.min(32, rootRect.height * 0.12)
  if (chapters.length === 0) return null

  // Chapter sections are direct children of the article and stay in document
  // order. Binary search avoids forcing layout for every chapter on every
  // scroll event (large TXT files commonly contain hundreds of sections).
  let low = 0
  let high = chapters.length - 1
  let candidate = 0
  while (low <= high) {
    const middle = (low + high) >> 1
    if (chapters[middle][1].offsetTop <= readingTop) {
      candidate = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return { id: chapters[candidate][0] }
}

export function ReaderLoading({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="reader-loading">
      <span className="loading-orb" />
      <p>{label}</p>
    </div>
  )
}

export function ReaderError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="reader-error">
      <strong>无法打开这本书</strong>
      <p>{message}</p>
    </div>
  )
}
