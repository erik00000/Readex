import { describe, expect, it, vi } from 'vitest'
import { normalizedWheelDelta, smoothScrollBy } from '../../src/renderer/src/lib/smoothScroll'

describe('fine wheel scrolling', () => {
  it('caps a standard mouse wheel event at the configured step', () => {
    expect(normalizedWheelDelta(100, 0, 48, 800)).toBe(42)
    expect(normalizedWheelDelta(-120, 0, 48, 800)).toBe(-48)
  })

  it('keeps high-resolution trackpad input proportional', () => {
    expect(normalizedWheelDelta(8, 0, 48, 800)).toBeCloseTo(3.6)
    expect(normalizedWheelDelta(-12, 0, 48, 800)).toBeCloseTo(-5.4)
  })

  it('normalizes line-based wheel events', () => {
    expect(normalizedWheelDelta(3, 1, 48, 800)).toBe(22.68)
  })
})


it('cancels an outstanding smooth movement before an immediate page turn', () => {
  const scheduled = new Map<number, FrameRequestCallback>()
  let sequence = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { scheduled.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id))
  try {
    const root = { scrollTop: 100, scrollHeight: 3000, clientHeight: 600 } as HTMLElement
    smoothScrollBy(root, 100, true)
    expect(scheduled.size).toBe(1)
    smoothScrollBy(root, 528, false)
    expect(scheduled.size).toBe(0)
    expect(root.scrollTop).toBe(628)
  } finally { vi.unstubAllGlobals() }
})
