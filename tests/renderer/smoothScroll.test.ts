import { describe, expect, it } from 'vitest'
import { normalizedWheelDelta } from '../../src/renderer/src/lib/smoothScroll'

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
