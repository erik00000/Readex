// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { ReaderSpeechSegment } from '../../src/renderer/src/readers/types'
import {
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
