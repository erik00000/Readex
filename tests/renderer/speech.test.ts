// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ReaderSpeechSegment } from '../../src/renderer/src/readers/types'
import {
  SpeechPlaybackController,
  findSpeechStartIndex,
  splitSpeechText
} from '../../src/renderer/src/lib/speech'

function segment(top: number, bottom: number): ReaderSpeechSegment {
  return {
    id: String(top),
    text: `segment-${top}`,
    top,
    bottom,
    range: document.createRange()
  }
}

describe('speech viewport selection', () => {
  it('starts at the first complete sentence intersecting the viewport', () => {
    const segments = [segment(0, 40), segment(45, 90), segment(95, 140)]
    expect(findSpeechStartIndex(segments, 50)).toBe(1)
  })

  it('uses a sentence whose top scrolled above the viewport but whose tail is visible', () => {
    const segments = [segment(0, 40), segment(30, 80), segment(85, 120)]
    expect(findSpeechStartIndex(segments, 50)).toBe(1)
  })

  it('returns the first sentence below the viewport when there is a gap', () => {
    const segments = [segment(0, 30), segment(120, 160)]
    expect(findSpeechStartIndex(segments, 60)).toBe(1)
  })
})

describe('speech text chunking', () => {
  it('keeps short sentences together and splits long ones', () => {
    expect(splitSpeechText('短句。')).toEqual(['短句。'])
    const chunks = splitSpeechText('字'.repeat(25), 10)
    expect(chunks).toHaveLength(3)
    expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 5])
  })
})


it('cancels speech while waiting for a subsequent chapter without restarting playback', async () => {
  let complete!: (advanced: boolean) => void
  const advance = new Promise<boolean>((resolve) => { complete = resolve })
  let ended: (() => void) | null = null
  const reader = {
    getSpeechSnapshot: () => ({ segments: [segment(0, 40)], startIndex: 0 }),
    advanceSpeechSection: () => advance,
    setSpeechSegmentHighlight: vi.fn(), scrollToSpeechSegment: vi.fn()
  }
  const synthesize = vi.fn(async () => ({ audio: new Uint8Array([1, 2]), cues: [], cached: false }))
  vi.stubGlobal('Audio', class {
    volume = 1
    set onended(callback: (() => void) | null) { ended = callback }
    onerror: (() => void) | null = null
    play = async () => undefined
    pause = () => undefined
  })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined })
  const controller = new SpeechPlaybackController({
    getReader: () => reader as unknown as import('../../src/renderer/src/readers/types').ReaderHandle,
    getSettings: () => ({ ttsVoice: 'zh-CN-XiaoxiaoNeural', ttsRate: 1, ttsVolume: 1 }),
    synthesize, onStateChange: vi.fn(), onMessage: vi.fn()
  })
  try {
    await controller.start()
    expect(controller.getState()).toBe('playing')
    ended!()
    expect(controller.getState()).toBe('loading')
    await controller.toggle()
    expect(controller.getState()).toBe('idle')
    complete(true)
    await Promise.resolve(); await Promise.resolve()
    expect(controller.getState()).toBe('idle')
    expect(synthesize).toHaveBeenCalledTimes(1)
  } finally { controller.destroy(); vi.unstubAllGlobals() }
})
