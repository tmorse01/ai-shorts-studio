import { describe, expect, it } from 'vitest'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import {
  POP_IN_MS,
  POP_IN_START_SCALE,
  blockSpanMs,
  highlightIndex,
  isBlockActive,
  popInScale
} from '@shared/captions/captionTiming'

const block: CaptionBlock = {
  id: 'b1',
  words: [
    { text: 'hello', startMs: 1000, endMs: 1400 },
    { text: 'there', startMs: 1500, endMs: 1900 },
    { text: 'friend', startMs: 2000, endMs: 2500 }
  ]
}

describe('caption block span', () => {
  it('runs from the first word start to the last word end', () => {
    expect(blockSpanMs(block)).toEqual({ startMs: 1000, endMs: 2500 })
    expect(isBlockActive(block, 999)).toBe(false)
    expect(isBlockActive(block, 1000)).toBe(true)
    expect(isBlockActive(block, 2499)).toBe(true)
    expect(isBlockActive(block, 2500)).toBe(false)
  })
})

describe('highlightIndex', () => {
  it('is -1 before the first word starts', () => {
    expect(highlightIndex(block, 500)).toBe(-1)
  })

  it('lights each word from its start', () => {
    expect(highlightIndex(block, 1000)).toBe(0)
    expect(highlightIndex(block, 1600)).toBe(1)
    expect(highlightIndex(block, 2100)).toBe(2)
  })

  it('keeps the previous word lit through the gap between words', () => {
    expect(highlightIndex(block, 1450)).toBe(0)
  })
})

describe('popInScale', () => {
  it('starts at the start scale and settles at 1', () => {
    expect(popInScale(0)).toBeCloseTo(POP_IN_START_SCALE, 10)
    expect(popInScale(POP_IN_MS)).toBeCloseTo(1, 10)
    expect(popInScale(POP_IN_MS * 5)).toBeCloseTo(1, 10)
  })

  it('clamps before the start', () => {
    expect(popInScale(-100)).toBeCloseTo(POP_IN_START_SCALE, 10)
  })

  it('overshoots 1 slightly on the way in, and never goes below the start', () => {
    const samples = Array.from({ length: 101 }, (_, index) => popInScale((index / 100) * POP_IN_MS))
    expect(Math.max(...samples)).toBeGreaterThan(1)
    expect(Math.max(...samples)).toBeLessThan(1.1)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(POP_IN_START_SCALE - 1e-9)
  })
})
