import chardet from 'chardet'
import iconv from 'iconv-lite'

export function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.byteLength >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return iconv.decode(buffer.subarray(3), 'utf8').replace(/^\uFEFF/, '')
  }
  if (buffer.byteLength >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer.subarray(2), 'utf16-le').replace(/^\uFEFF/, '')
  }
  if (buffer.byteLength >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.subarray(2), 'utf16-be').replace(/^\uFEFF/, '')
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    // Continue with legacy Chinese encodings.
  }

  const detected = normalizeEncoding(String(chardet.detect(buffer) ?? ''))
  if (detected === 'big5') return iconv.decode(buffer, 'big5').replace(/^\uFEFF/, '')
  if (detected === 'gb18030') return iconv.decode(buffer, 'gb18030').replace(/^\uFEFF/, '')

  if (containsHighBytes(buffer)) {
    const gbText = iconv.decode(buffer, 'gb18030')
    const big5Text = iconv.decode(buffer, 'big5')
    const gbScore = chineseScore(gbText)
    const big5Score = chineseScore(big5Text)
    if (gbScore >= 0.18 || big5Score >= 0.18) {
      return gbScore >= big5Score ? gbText : big5Text
    }
  }

  return iconv.decode(buffer, detected === 'latin1' ? 'latin1' : 'utf8').replace(/^\uFEFF/, '')
}

function normalizeEncoding(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.includes('GB18030') || normalized.includes('GB2312')) return 'gb18030'
  if (normalized.includes('BIG5')) return 'big5'
  if (normalized.includes('UTF16') && normalized.includes('BE')) return 'utf16-be'
  if (normalized.includes('UTF16')) return 'utf16-le'
  if (normalized.includes('ISO88591') || normalized.includes('WINDOWS1252')) return 'latin1'
  return 'utf8'
}

function containsHighBytes(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16_384))
  return sample.some((byte) => byte >= 0x80)
}

function chineseScore(value: string): number {
  const sample = value.slice(0, 2000)
  if (!sample) return 0
  const chinese = sample.match(/[\u3400-\u9fff]/g)?.length ?? 0
  return chinese / sample.length
}
