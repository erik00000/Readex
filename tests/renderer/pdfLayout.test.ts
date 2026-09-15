import { describe, expect, it } from 'vitest'
import { calculatePdfDisplayScale } from '../../src/renderer/src/lib/pdfLayout'

describe('PDF adaptive layout', () => {
  it('fits a wide PDF page to the available reading width', () => {
    expect(
      calculatePdfDisplayScale({
        availableWidth: 960,
        pageWidth: 1600,
        zoom: 1
      })
    ).toBe(0.6)
  })

  it('uses zoom as a multiplier relative to fit-width', () => {
    expect(
      calculatePdfDisplayScale({
        availableWidth: 800,
        pageWidth: 1000,
        zoom: 1.5
      })
    ).toBeCloseTo(1.2)
  })

  it('falls back safely when page dimensions are not ready', () => {
    expect(
      calculatePdfDisplayScale({
        availableWidth: 0,
        pageWidth: 0,
        zoom: 1
      })
    ).toBe(1)
  })
})
