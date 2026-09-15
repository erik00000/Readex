import { initKf8File, initMobiFile } from '@lingo-reader/mobi-parser'

export interface MobiMetadataLike {
  title: string
  author: string[]
  publisher: string
  language: string
  description: string
}

export interface MobiChapterLike {
  id: string
  html: string
}

export interface MobiDocument {
  getMetadata: () => MobiMetadataLike
  getSpine: () => Array<Record<string, unknown>>
  loadChapter: (id: string) => MobiChapterLike | undefined
  getToc: () => Array<Record<string, unknown>>
  resolveHref: (href: string) => { id: string; selector: string } | undefined
  getCoverImage: () => string
  destroy: () => void
}

export async function openMobiDocument(
  data: Uint8Array,
  resourceDirectory: string
): Promise<MobiDocument> {
  const mobi = (await initMobiFile(data, resourceDirectory)) as unknown as MobiDocument
  const mobiSpine = mobi.getSpine()
  const firstChapter = mobiSpine[0] ? mobi.loadChapter(String(mobiSpine[0].id)) : undefined
  const firstTextLength = htmlToText(firstChapter?.html ?? '').length

  if (mobiSpine.length > 1 || firstTextLength > 500) {
    return mobi
  }

  try {
    const kf8 = (await initKf8File(data, resourceDirectory)) as unknown as MobiDocument
    const kf8Spine = kf8.getSpine()
    if (kf8Spine.length > mobiSpine.length) {
      mobi.destroy()
      return kf8
    }
    kf8.destroy()
  } catch {
    // If the file is not KF8, retain the MOBI parser result.
  }

  return mobi
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
