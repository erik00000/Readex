import notoSerifChineseUrl from '../assets/fonts/noto-serif-sc/noto-serif-sc-chinese-simplified-400.woff2?url'
import notoSerifLatinUrl from '../assets/fonts/noto-serif-sc/noto-serif-sc-latin-400.woff2?url'
import lxgwWenKaiUrl from '../assets/fonts/lxgw-wenkai/lxgw-wenkai-500.woff2?url'
import zcoolXiaoWeiChineseUrl from '../assets/fonts/zcool-xiaowei/zcool-xiaowei-chinese-simplified-400.woff2?url'
import zcoolXiaoWeiLatinUrl from '../assets/fonts/zcool-xiaowei/zcool-xiaowei-latin-400.woff2?url'

const CJK_UNICODE_RANGE =
  'U+2E80-2EFF, U+3000-303F, U+3040-30FF, U+31C0-31EF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF'
const LATIN_UNICODE_RANGE = 'U+0000-024F, U+1E00-1EFF, U+2000-206F'
const embeddedFontDocuments = new WeakSet<Document>()

export function embeddedFontCss(baseUrl = document.baseURI): string {
  const asset = (path: string): string => new URL(path, baseUrl).href
  return `
@font-face {
  font-family: "Noto Serif SC";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("${asset(notoSerifChineseUrl)}") format("woff2");
  unicode-range: ${CJK_UNICODE_RANGE};
}
@font-face {
  font-family: "Noto Serif SC";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("${asset(notoSerifLatinUrl)}") format("woff2");
  unicode-range: ${LATIN_UNICODE_RANGE};
}
@font-face {
  font-family: "LXGW WenKai";
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url("${asset(lxgwWenKaiUrl)}") format("woff2");
}
@font-face {
  font-family: "ZCOOL XiaoWei";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("${asset(zcoolXiaoWeiChineseUrl)}") format("woff2");
  unicode-range: ${CJK_UNICODE_RANGE};
}
@font-face {
  font-family: "ZCOOL XiaoWei";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("${asset(zcoolXiaoWeiLatinUrl)}") format("woff2");
  unicode-range: ${LATIN_UNICODE_RANGE};
}
`
}

export function ensureEmbeddedFonts(
  targetDocument: Document = document,
  baseUrl = window.location.href
): void {
  if (embeddedFontDocuments.has(targetDocument)) return
  const css = embeddedFontCss(baseUrl)

  // EPUB sections can be parsed as XHTML/XML. A style element inserted through
  // the HTML parser may become visible text there, so prefer CSSOM injection.
  const ownerWindow = targetDocument.defaultView
  if (ownerWindow && 'adoptedStyleSheets' in targetDocument) {
    try {
      const sheet = new ownerWindow.CSSStyleSheet()
      sheet.replaceSync(css)
      targetDocument.adoptedStyleSheets = [...targetDocument.adoptedStyleSheets, sheet]
      embeddedFontDocuments.add(targetDocument)
      return
    } catch {
      // Fall through for older Chromium or restricted XHTML documents.
    }
  }

  if (targetDocument.getElementById('readex-embedded-fonts')) {
    embeddedFontDocuments.add(targetDocument)
    return
  }
  const namespace = targetDocument.documentElement?.namespaceURI
  const style =
    namespace && namespace !== 'http://www.w3.org/1999/xhtml'
      ? targetDocument.createElementNS(namespace, 'style')
      : targetDocument.createElement('style')
  style.id = 'readex-embedded-fonts'
  style.setAttribute('type', 'text/css')
  style.setAttribute('media', 'screen')
  style.textContent = css
  const target = targetDocument.head ?? targetDocument.documentElement
  target.append(style)
  embeddedFontDocuments.add(targetDocument)
}
