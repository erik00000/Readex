// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  hasActiveTextSelection,
  hasExceededFloatingDragThreshold,
  shouldPromoteFloatingDrag,
  shouldTrackFloatingDrag
} from '../../src/renderer/src/lib/floatingDrag'

function pointerEvent(
  target: Element
): Pick<PointerEvent, 'target'> {
  return { target }
}

describe('floating reader drag targeting', () => {
  it('tracks pointer presses on an empty reader surface', () => {
    document.body.innerHTML = '<div class="reader-stage"></div>'

    expect(shouldTrackFloatingDrag(pointerEvent(document.querySelector('.reader-stage')!))).toBe(
      true
    )
  })

  it('keeps interactive controls clickable', () => {
    document.body.innerHTML = '<div class="reader-stage"><button><span>关闭</span></button></div>'

    expect(
      shouldTrackFloatingDrag(pointerEvent(document.querySelector('button span')!))
    ).toBe(false)
  })

  it('waits for pointer movement before deciding between dragging and selection', () => {
    document.body.innerHTML =
      '<article data-floating-reader-content><p>可选择的正文</p></article>'

    expect(shouldTrackFloatingDrag(pointerEvent(document.querySelector('p')!))).toBe(true)
  })

  it('requires a small movement threshold', () => {
    expect(hasExceededFloatingDragThreshold(10, 10, 12, 12)).toBe(false)
    expect(hasExceededFloatingDragThreshold(10, 10, 14, 10)).toBe(true)
  })

  it('does not drag the window after text has been selected', () => {
    expect(
      hasActiveTextSelection({
        isCollapsed: false,
        toString: () => '已选正文'
      } as Selection)
    ).toBe(true)
    expect(
      hasActiveTextSelection({
        isCollapsed: true,
        toString: () => ''
      } as Selection)
    ).toBe(false)
  })

  it('allows dragging after a previous selection when the selection did not change', () => {
    const selection = {
      isCollapsed: false,
      toString: () => '之前选中的正文'
    } as Selection

    expect(shouldPromoteFloatingDrag(selection, '之前选中的正文')).toBe(true)
    expect(shouldPromoteFloatingDrag(selection, '')).toBe(false)
  })
})
