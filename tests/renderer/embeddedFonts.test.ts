import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { ensureEmbeddedFonts } from '@renderer/lib/embeddedFonts'

describe('ensureEmbeddedFonts', () => {
  it('prefers adopted stylesheets so EPUB XHTML cannot render the CSS text', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
    const document = dom.window.document
    const css: string[] = []
    const sheets: CSSStyleSheet[] = []
    class TestStyleSheet {
      replaceSync(value: string): void {
        css.push(value)
      }
    }

    Object.defineProperty(dom.window, 'CSSStyleSheet', { value: TestStyleSheet })
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: sheets
    })

    ensureEmbeddedFonts(document, 'file:///D:/Readex/index.html')

    expect(css).toHaveLength(1)
    expect(css[0]).toContain('@font-face')
    expect(document.adoptedStyleSheets).toHaveLength(1)
    expect(document.getElementById('readex-embedded-fonts')).toBeNull()

    ensureEmbeddedFonts(document, 'file:///D:/Readex/index.html')
    expect(css).toHaveLength(1)
    expect(document.adoptedStyleSheets).toHaveLength(1)
  })

  it('falls back to a style element when CSSStyleSheet is unavailable', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
    const document = dom.window.document

    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      value: undefined
    })

    ensureEmbeddedFonts(document, 'file:///D:/Readex/index.html')

    const style = document.getElementById('readex-embedded-fonts')
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent).toContain('@font-face')
    expect(style?.parentElement?.tagName).toBe('HEAD')
  })
})
