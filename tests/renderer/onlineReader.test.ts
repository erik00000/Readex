// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnlineReader } from '../../src/renderer/src/readers/OnlineReader'
import type { ReaderHandle, ReaderProps } from '../../src/renderer/src/readers/types'
import type { ReadexApi } from '../../src/shared/global'
import { DEFAULT_READER_SETTINGS, type OnlineChapter } from '../../src/shared/types'

const chapters = [1, 2, 3].map((n) => ({ id: `chapter-${n}`, label: `第${n}章`, url: `https://ixdzs8.com/read/123/p${n}.html` }))
const content = (index: number): OnlineChapter => ({ ...chapters[index], cached: true, text: '这是当前章节的正文。还有下一句。', html: `<h1>${chapters[index].label}</h1><p>这是当前章节的正文。还有下一句。</p>` })
let root: Root
let host: HTMLDivElement
let ref: ReturnType<typeof createRef<ReaderHandle>>
let props: ReaderProps
let chapterRequest: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
  Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => null })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 10, bottom: 35, height: 25, left: 0, width: 300 }) })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? this.scrollTop } })
  chapterRequest = vi.fn(async (_book: string, id: string) => content(chapters.findIndex((c) => c.id === id)))
  window.readex = { online: { catalog: async () => ({ chapters }), chapter: chapterRequest }, reading: { getState: async () => null, saveState: vi.fn(async () => undefined) } } as unknown as ReadexApi
  ref = createRef<ReaderHandle>()
  props = { book: { id: 'test', online: { source: 'ixdzs', url: 'https://ixdzs8.com/read/123/' } } as ReaderProps['book'], settings: { ...DEFAULT_READER_SETTINGS, autoScrollSpeed: 100, autoScrollHighlight: false }, annotations: [], onSelection: vi.fn(), onSelectionContextMenu: vi.fn(), onReaderPointerDown: () => ref.current?.stopAutoScroll(), onOpenAnnotation: vi.fn(), onProgress: vi.fn(), onTocChange: vi.fn(), onError: vi.fn(), onAutoScrollEnd: vi.fn() }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(createElement(OnlineReader, { ...props, ref })) })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const scroll = () => host.querySelector<HTMLElement>('.online-reader-scroll')!

describe('online automatic reading and page navigation', () => {
  it('turns a full page in continuous mode and crosses chapters at their boundaries', async () => {
    await act(async () => { ref.current!.turnPage!(1) })
    expect(scroll().scrollTop).toBe(528)
    scroll().scrollTop = 1200
    await act(async () => { ref.current!.turnPage!(1) })
    expect(host.querySelector('h1')!.textContent).toBe('第2章')
    expect(scroll().scrollTop).toBe(0)
    await act(async () => { ref.current!.turnPage!(-1) })
    expect(host.querySelector('h1')!.textContent).toBe('第1章')
    expect(scroll().scrollTop).toBe(1200)
  })

  it('continues automatic scrolling in the next chapter after mounting and positioning it', async () => {
    scroll().scrollTop = 1200
    await act(async () => { expect(ref.current!.startAutoScroll()).toBe('started'); await vi.advanceTimersByTimeAsync(1200) })
    expect(host.querySelector('h1')!.textContent).toBe('第2章')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(scroll().scrollTop).toBeGreaterThan(40)
    ref.current!.stopAutoScroll()
    const stopped = scroll().scrollTop
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(scroll().scrollTop).toBe(stopped)
  })

  it('does not resume automatically when paused while the next chapter is loading', async () => {
    let complete!: (chapter: OnlineChapter) => void
    chapterRequest.mockImplementationOnce(() => new Promise<OnlineChapter>((resolve) => { complete = resolve }))
    scroll().scrollTop = 1200
    await act(async () => { ref.current!.startAutoScroll(); await vi.advanceTimersByTimeAsync(1200) })
    expect(complete).toBeTypeOf('function')
    ref.current!.stopAutoScroll()
    await act(async () => { complete(content(1)) })
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(host.querySelector('h1')!.textContent).toBe('第2章')
    expect(scroll().scrollTop).toBe(0)
  })

  it('provides sentence snapshots for speech and waits for the next chapter before continuing', async () => {
    const first = ref.current!.getSpeechSnapshot()!
    expect(first.segments.length).toBeGreaterThan(1)
    expect(first.segments.every((s) => s.id.startsWith('chapter-1:'))).toBe(true)
    let next!: Promise<boolean>
    await act(async () => { next = ref.current!.advanceSpeechSection() })
    expect(await next).toBe(true)
    expect(host.querySelector('h1')!.textContent).toBe('第2章')
    expect(ref.current!.getSpeechSnapshot()!.segments.every((s) => s.id.startsWith('chapter-2:'))).toBe(true)
  })
})
