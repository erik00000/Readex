import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import type { Annotation, ReadingLocator, SearchResult, TocItem } from '@shared/types'
import { ANNOTATION_COLORS } from '@shared/types'
import type { ReaderHandle, ReaderProps } from './types'
import type { AutoScrollStatus } from './types'
import { ReaderError, ReaderLoading } from './TextFlowReader'
import { normalizedWheelDelta, smoothScrollBy } from '../lib/smoothScroll'
import { AutoScrollController } from '../lib/autoScroll'
import { isLightColor } from '../lib/theme'
import { calculatePdfDisplayScale } from '../lib/pdfLayout'

GlobalWorkerOptions.workerSrc = workerUrl
const PDF_PAGE_HORIZONTAL_GUTTER = 48

export const PdfReader = forwardRef<ReaderHandle, ReaderProps>(function PdfReader(
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
    onAutoScrollEnd
  },
  ref
): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const pageRefs = useRef(new Map<number, HTMLElement>())
  const [pageCount, setPageCount] = useState(0)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    const root = scrollRef.current
    if (!root) return
    const updateWidth = (): void => {
      setAvailableWidth(Math.max(280, root.clientWidth - PDF_PAGE_HORIZONTAL_GUTTER))
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    const resourceUrl = window.readex.book.getResourceUrl(book.id, book.format)
    void getDocument({ url: resourceUrl }).promise
      .then(async (pdf) => {
        if (!active) {
          await pdf.destroy()
          return
        }
        documentRef.current = pdf
        setPageCount(pdf.numPages)
        onTocChange(
          Array.from({ length: pdf.numPages }, (_, index) => ({
            id: `pdf-page-${index + 1}`,
            label: `第 ${index + 1} 页`,
            chapterId: String(index + 1)
          }))
        )
        const state = await window.readex.reading.getState(book.id)
        if (state?.locator?.page) {
          const pageNumber = state.locator.page
          window.setTimeout(() => {
            pageRefs.current.get(pageNumber)?.scrollIntoView({ block: 'start' })
          }, 80)
        }
        setLoading(false)
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : 'PDF 无法打开'
        setError(message)
        onError(message)
        setLoading(false)
      })

    return () => {
      active = false
      const pdf = documentRef.current
      documentRef.current = null
      void pdf?.destroy()
    }
  }, [book.id])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || loading) return
    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      onReaderPointerDown()
      const current = settingsRef.current
      smoothScrollBy(
        root,
        normalizedWheelDelta(
          event.deltaY,
          event.deltaMode,
          current.wheelScrollStep,
          root.clientHeight
        ),
        current.smoothScrolling
      )
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [loading])

  const reportProgress = (): void => {
    const root = scrollRef.current
    if (!root || !pageCount) return
    const rootRect = root.getBoundingClientRect()
    let closestPage = 1
    let distance = Number.POSITIVE_INFINITY
    for (const [page, element] of pageRefs.current) {
      const rect = element.getBoundingClientRect()
      const nextDistance = Math.abs(rect.top - rootRect.top)
      if (nextDistance < distance) {
        distance = nextDistance
        closestPage = page
      }
    }
    const max = Math.max(1, root.scrollHeight - root.clientHeight)
    const progress = Math.max(0, Math.min(1, root.scrollTop / max))
    onProgress(
      {
        type: 'pdf-rect',
        value: String(closestPage),
        page: closestPage
      },
      progress
    )
  }

  const handleSelection = (page: number, event: React.MouseEvent): void => {
    const pageElement = pageRefs.current.get(page)
    const selection = window.getSelection()
    if (!pageElement || !selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const text = selection.toString().replace(/\s+/g, ' ').trim()
    if (!text) return

    const pageRect = pageElement.getBoundingClientRect()
    const rects = Array.from(selection.getRangeAt(0).getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: (rect.left - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        width: rect.width / pageRect.width,
        height: rect.height / pageRect.height
      }))
    if (!rects.length) return

    onSelection({
      text,
      locator: {
        type: 'pdf-rect',
        value: String(page),
        page,
        rects,
        excerpt: text
      },
      x: event.clientX,
      y: event.clientY
    })
  }

  const goTo = (target: ReadingLocator | TocItem): void => {
    let page: number | undefined
    if ('page' in target) page = target.page
    else if ('chapterId' in target && target.chapterId) page = Number(target.chapterId)
    else if ('value' in target) page = Number(target.value)
    if (page !== undefined && Number.isFinite(page)) {
      pageRefs.current.get(page)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }

  const search = async (query: string): Promise<SearchResult[]> => {
    const pdf = documentRef.current
    const normalized = query.trim().toLocaleLowerCase()
    if (!pdf || !normalized) return []
    const results: SearchResult[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      const lower = text.toLocaleLowerCase()
      let start = 0
      while (results.length < 200) {
        const index = lower.indexOf(normalized, start)
        if (index < 0) break
        results.push({
          id: `${book.id}:pdf:${pageNumber}:${index}`,
          bookId: book.id,
          bookTitle: book.title,
          source: 'text',
          title: `第 ${pageNumber} 页`,
          excerpt: text.slice(Math.max(0, index - 60), index + normalized.length + 60),
          locator: {
            type: 'pdf-rect',
            value: String(pageNumber),
            page: pageNumber,
            excerpt: text.slice(index, index + normalized.length)
          }
        })
        start = index + normalized.length
      }
      if (results.length >= 200) break
    }
    return results
  }

  const scrollBy = (delta: number): void => {
    const root = scrollRef.current
    if (root) smoothScrollBy(root, delta, settingsRef.current.smoothScrolling)
  }

  const ensureAutoScrollController = (): AutoScrollController => {
    if (!autoScrollControllerRef.current) {
      autoScrollControllerRef.current = new AutoScrollController({
        getContainer: () => scrollRef.current,
        getRoots: () => {
          const root = scrollRef.current
          if (!root) return []
          const rootRect = root.getBoundingClientRect()
          return [...pageRefs.current.entries()].flatMap(([, pageElement]) => {
            const textLayer = pageElement.querySelector(
              '.pdf-text-layer'
            ) as HTMLElement | null
            if (!textLayer) return []
            return [
              {
                el: textLayer,
                document: textLayer.ownerDocument,
                highlightHost: textLayer,
                mapY: (viewportY: number): number =>
                  viewportY - rootRect.top + root.scrollTop
              }
            ]
          })
        },
        getSpeed: () => settingsRef.current.autoScrollSpeed,
        getHighlightColor: () => settingsRef.current.autoScrollColor,
        isLightBackground: () => isLightColor(settingsRef.current.backgroundColor),
        isHighlightEnabled: () => settingsRef.current.autoScrollHighlight,
        getHighlightStyle: () => settingsRef.current.autoScrollHighlightStyle,
        getBandHost: () => scrollRef.current?.parentElement ?? null,
        getBandRect: () => {
          const shell = scrollRef.current?.querySelector('.pdf-page-shell')
          const rect = shell?.getBoundingClientRect()
          return rect ? { left: rect.left, width: rect.width } : null
        },
        onEnd: () => autoScrollEndHandler.current?.()
      })
    }
    return autoScrollControllerRef.current
  }

  const startAutoScroll = (): AutoScrollStatus => {
    return ensureAutoScrollController().start()
  }

  const stopAutoScroll = (): void => {
    autoScrollControllerRef.current?.stop()
  }

  useEffect(() => {
    return () => stopAutoScroll()
  }, [book.id])

  useImperativeHandle(ref, () => ({
    goTo,
    scrollBy,
    search,
    startAutoScroll,
    stopAutoScroll,
    getSpeechSnapshot: () => null,
    scrollToSpeechSegment: () => undefined,
    setSpeechSegmentHighlight: () => undefined,
    advanceSpeechSection: async () => false
  }))

  return (
    <div className={`pdf-reader theme-${settings.theme}`} ref={scrollRef} onScroll={reportProgress}>
      {loading && <ReaderLoading label="正在渲染 PDF" />}
      {error && <ReaderError message={error} />}
      <div className="pdf-pages">
        {Array.from({ length: pageCount }, (_, index) => (
          <PdfPage
            annotations={annotations}
            key={index + 1}
            pageNumber={index + 1}
            pdf={documentRef.current}
            availableWidth={availableWidth}
            zoom={settings.pdfScale}
            onOpenAnnotation={onOpenAnnotation}
            onSelection={handleSelection}
            refCallback={(element) => {
              if (element) pageRefs.current.set(index + 1, element)
              else pageRefs.current.delete(index + 1)
            }}
          />
        ))}
      </div>
    </div>
  )
})

function PdfPage({
  pdf,
  pageNumber,
  availableWidth,
  zoom,
  annotations,
  onSelection,
  onOpenAnnotation,
  refCallback
}: {
  pdf: PDFDocumentProxy | null
  pageNumber: number
  availableWidth: number
  zoom: number
  annotations: Annotation[]
  onSelection: (page: number, event: React.MouseEvent) => void
  onOpenAnnotation: (annotation: Annotation) => void
  refCallback: (element: HTMLDivElement | null) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(pageNumber <= 2)
  const [baseViewport, setBaseViewport] = useState({ width: 720, height: 980 })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin: '900px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || !visible) return
    let active = true
    void pdf.getPage(pageNumber).then((loadedPage) => {
      if (!active) return
      setPage(loadedPage)
      const viewport = loadedPage.getViewport({ scale: 1 })
      setBaseViewport({ width: viewport.width, height: viewport.height })
    })
    return () => {
      active = false
    }
  }, [pdf, pageNumber, visible])

  const displayScale = calculatePdfDisplayScale({
    availableWidth,
    pageWidth: baseViewport.width,
    zoom
  })
  const dimensions = {
    width: baseViewport.width * displayScale,
    height: baseViewport.height * displayScale
  }

  useEffect(() => {
    if (!page || !canvasRef.current || !textLayerRef.current) return
    let active = true
    const viewport = page.getViewport({ scale: displayScale })
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return
    const outputScale = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
    })
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayerRef.current,
      viewport
    })
    textLayerRef.current.replaceChildren()
    textLayerRef.current.style.setProperty('--scale-factor', String(viewport.scale))
    void Promise.all([renderTask.promise, textLayer.render()]).catch(() => {
      if (active) {
        // Render cancellation happens when zooming or closing quickly.
      }
    })

    return () => {
      active = false
      textLayer.cancel()
      renderTask.cancel()
    }
  }, [page, displayScale])

  const pageAnnotations = annotations.filter((annotation) => annotation.locator.page === pageNumber)

  return (
    <div
      className="pdf-page-shell"
      ref={(element) => {
        containerRef.current = element
        refCallback(element)
      }}
      data-page={pageNumber}
    >
      <div
        className="pdf-page"
        data-floating-reader-content=""
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseUp={(event) => onSelection(pageNumber, event)}
      >
        <canvas ref={canvasRef} />
        <div className="pdf-text-layer" ref={textLayerRef} />
        <div className="pdf-annotations">
          {pageAnnotations.flatMap((annotation) =>
            (annotation.locator.rects ?? []).map((rect, index) => (
              <button
                className="pdf-annotation"
                type="button"
                key={`${annotation.id}-${index}`}
                title={annotation.note || annotation.text}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  background: ANNOTATION_COLORS[annotation.color]
                }}
                onClick={() => onOpenAnnotation(annotation)}
              />
            ))
          )}
        </div>
      </div>
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  )
}
