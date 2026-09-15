import { describe, expect, it } from 'vitest'
import { getFloatingMenuPosition } from '../../src/renderer/src/components/SelectionContextMenu'

const base = {
  width: 252,
  height: 320,
  viewportWidth: 1200,
  viewportHeight: 800
}

describe('selection context menu positioning', () => {
  it('opens to the right and below when there is enough room', () => {
    expect(getFloatingMenuPosition({ ...base, x: 120, y: 160 })).toEqual({
      left: 120,
      top: 160
    })
  })

  it('flips left and above near the viewport edges', () => {
    expect(getFloatingMenuPosition({ ...base, x: 1180, y: 780 })).toEqual({
      left: 930,
      top: 462
    })
  })

  it('keeps the menu inside the viewport when it is larger than the available space', () => {
    expect(
      getFloatingMenuPosition({
        ...base,
        width: 1300,
        height: 900,
        x: 20,
        y: 20
      })
    ).toEqual({ left: 8, top: 8 })
  })
})
