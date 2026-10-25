import { describe, expect, it } from 'vitest'
import type { CaptionBlock, CaptionWord } from '@shared/captions/captionBlock'
import {
  MIN_CAPTION_MS,
  editCaptionText,
  mergeCaptionWithNext,
  moveCaptionBlock,
  retimeCaptionWords,
  splitCaptionAtMs,
  trimCaptionBlock
} from '@shared/captions/captionEditing'

function word(text: string, startMs: number, endMs: number): CaptionWord {
  return { text, startMs, endMs }
}

function block(id: string, ...words: CaptionWord[]): CaptionBlock {
  return { id, words }
}

function spans(blocks: readonly CaptionBlock[]): [string, number, number][] {
  return blocks.map((item) => [
    item.id,
    item.words[0].startMs,
    item.words[item.words.length - 1].endMs
  ])
}

function texts(item: CaptionBlock): string[] {
  return item.words.map((entry) => entry.text)
}

describe('retimeCaptionWords', () => {
  const old = [word('one', 0, 100), word('two', 100, 200), word('three', 200, 300)]

  it('keeps the timing of unchanged words', () => {
    const next = retimeCaptionWords(old, ['one', 'two', 'three'])
    expect(next).toEqual(old)
  })

  it('keeps the timing of a matched word when the spelling changes around it', () => {
    const next = retimeCaptionWords(old, ['one', 'TWO', 'three'])
    expect(next[1]).toEqual({ text: 'TWO', startMs: 100, endMs: 200 })
  })

  it('keeps matched timings and spreads a new word between its neighbours', () => {
    const next = retimeCaptionWords(old, ['one', 'middle', 'two', 'three'])
    expect(next[0]).toEqual({ text: 'one', startMs: 0, endMs: 100 })
    expect(next[2]).toEqual({ text: 'two', startMs: 100, endMs: 200 })
    expect(next[3]).toEqual({ text: 'three', startMs: 200, endMs: 300 })
    // The new word fills the space between 'one' and 'two'.
    expect(next[1]).toEqual({ text: 'middle', startMs: 100, endMs: 100 })
  })

  it('shares the whole block span when no word matches', () => {
    const next = retimeCaptionWords(old, ['a', 'b', 'c'])
    expect(next.map((entry) => [entry.startMs, entry.endMs])).toEqual([
      [0, 100],
      [100, 200],
      [200, 300]
    ])
  })

  it('matches words without their punctuation or case', () => {
    const withPunctuation = [word('Hello,', 0, 200), word('world', 200, 400)]
    const next = retimeCaptionWords(withPunctuation, ['hello', 'world!'])
    expect(next).toEqual([
      { text: 'hello', startMs: 0, endMs: 200 },
      { text: 'world!', startMs: 200, endMs: 400 }
    ])
  })

  it('keeps the old timing of a word repeated in new text', () => {
    const repeated = [word('go', 0, 100), word('go', 100, 200)]
    const next = retimeCaptionWords(repeated, ['go', 'go', 'go'])
    expect(next[0]).toEqual({ text: 'go', startMs: 0, endMs: 100 })
    expect(next[1]).toEqual({ text: 'go', startMs: 100, endMs: 200 })
    expect(next[2]).toEqual({ text: 'go', startMs: 200, endMs: 200 })
  })

  it('returns nothing when there is no text to time', () => {
    expect(retimeCaptionWords(old, [])).toEqual([])
    expect(retimeCaptionWords([], ['a'])).toEqual([])
  })

  it('never produces a word that ends before it starts', () => {
    const next = retimeCaptionWords(old, ['a', 'b', 'c', 'd', 'e', 'one', 'f', 'g'])
    for (const entry of next) expect(entry.endMs).toBeGreaterThanOrEqual(entry.startMs)
  })
})

describe('editCaptionText', () => {
  it('replaces the text and keeps the block id and style', () => {
    const original = { ...block('c1', word('one', 0, 100), word('two', 100, 200)), styleId: 's' }
    const edited = editCaptionText(original, '  one   two  three ')
    expect(edited?.id).toBe('c1')
    expect(edited?.styleId).toBe('s')
    expect(texts(edited as CaptionBlock)).toEqual(['one', 'two', 'three'])
  })

  it('returns null for text with no words', () => {
    expect(editCaptionText(block('c1', word('one', 0, 100)), '   ')).toBeNull()
  })
})

describe('moveCaptionBlock', () => {
  const blocks = [
    block('a', word('a', 0, 500)),
    block('b', word('b', 1000, 1500)),
    block('c', word('c', 2000, 2500))
  ]

  it('shifts the block and all its words', () => {
    const moved = moveCaptionBlock(blocks, 'b', 200)
    expect(spans(moved)[1]).toEqual(['b', 1200, 1700])
    expect(moved[1].words[0]).toEqual({ text: 'b', startMs: 1200, endMs: 1700 })
  })

  it('stops at the previous block and the next block', () => {
    expect(spans(moveCaptionBlock(blocks, 'b', -2000))[1]).toEqual(['b', 500, 1000])
    expect(spans(moveCaptionBlock(blocks, 'b', 5000))[1]).toEqual(['b', 1500, 2000])
  })

  it('stops at zero for the first block', () => {
    const moved = moveCaptionBlock(blocks, 'a', -300)
    expect(spans(moved)[0]).toEqual(['a', 0, 500])
  })

  it('returns the same list when nothing moves', () => {
    expect(moveCaptionBlock(blocks, 'a', 0)).toBe(blocks)
    expect(moveCaptionBlock(blocks, 'a', -50)).toBe(blocks)
    expect(moveCaptionBlock(blocks, 'missing', 100)).toBe(blocks)
  })
})

describe('trimCaptionBlock', () => {
  const words = [word('one', 0, 400), word('two', 400, 800), word('three', 800, 1200)]
  const blocks = [block('a', ...words), block('b', word('x', 1500, 2000))]

  it('trims the end and drops words that start after it', () => {
    const trimmed = trimCaptionBlock(blocks, 'a', 'end', 500)
    expect(texts(trimmed[0])).toEqual(['one', 'two'])
    expect(trimmed[0].words[1]).toEqual({ text: 'two', startMs: 400, endMs: 500 })
  })

  it('trims the start and drops words that end before it', () => {
    const trimmed = trimCaptionBlock(blocks, 'a', 'start', 500)
    expect(texts(trimmed[0])).toEqual(['two', 'three'])
    expect(trimmed[0].words[0]).toEqual({ text: 'two', startMs: 500, endMs: 800 })
  })

  it('extends the last word when the end moves out', () => {
    const trimmed = trimCaptionBlock(blocks, 'a', 'end', 1400)
    expect(trimmed[0].words[2]).toEqual({ text: 'three', startMs: 800, endMs: 1400 })
  })

  it('stops the end at the next block', () => {
    const trimmed = trimCaptionBlock(blocks, 'a', 'end', 9000)
    expect(spans(trimmed)[0]).toEqual(['a', 0, 1500])
  })

  it('keeps at least the minimum length', () => {
    const trimmed = trimCaptionBlock(blocks, 'a', 'start', 5000)
    const first = trimmed[0].words[0]
    expect(first.endMs - first.startMs).toBeGreaterThanOrEqual(0)
    expect(trimmed[0].words[trimmed[0].words.length - 1].endMs - first.startMs).toBe(MIN_CAPTION_MS)
  })

  it('does not let a start edge pass the previous block', () => {
    const pair = [block('a', word('a', 0, 500)), block('b', word('b', 1000, 1500))]
    const trimmed = trimCaptionBlock(pair, 'b', 'start', 0)
    expect(spans(trimmed)[1]).toEqual(['b', 500, 1500])
  })

  it('returns the same list for an unknown block', () => {
    expect(trimCaptionBlock(blocks, 'missing', 'end', 100)).toBe(blocks)
  })
})

describe('splitCaptionAtMs', () => {
  const blocks = [
    block('a', word('one', 0, 100), word('two', 100, 200), word('three', 200, 300)),
    block('z', word('z', 1000, 1100))
  ]

  it('splits before the first word at or after the playhead', () => {
    const split = splitCaptionAtMs(blocks, 'a', 150, 'new')
    expect(spans(split)).toEqual([
      ['a', 0, 200],
      ['new', 200, 300],
      ['z', 1000, 1100]
    ])
    expect(texts(split[0])).toEqual(['one', 'two'])
    expect(texts(split[1])).toEqual(['three'])
  })

  it('keeps the style on the new block', () => {
    const styled = [{ ...blocks[0], styleId: 'bold' }, blocks[1]]
    const split = splitCaptionAtMs(styled, 'a', 150, 'new')
    expect(split[1].styleId).toBe('bold')
  })

  it('returns the same list when the playhead is before the first word or after the last', () => {
    expect(splitCaptionAtMs(blocks, 'a', 0, 'new')).toBe(blocks)
    expect(splitCaptionAtMs(blocks, 'a', 500, 'new')).toBe(blocks)
  })
})

describe('mergeCaptionWithNext', () => {
  it('joins a block with the block after it and keeps the first id', () => {
    const blocks = [block('a', word('one', 0, 100)), block('b', word('two', 200, 300))]
    const merged = mergeCaptionWithNext(blocks, 'a')
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a')
    expect(texts(merged[0])).toEqual(['one', 'two'])
  })

  it('returns the same list for the last block', () => {
    const blocks = [block('a', word('one', 0, 100)), block('b', word('two', 200, 300))]
    expect(mergeCaptionWithNext(blocks, 'b')).toBe(blocks)
    expect(mergeCaptionWithNext(blocks, 'missing')).toBe(blocks)
  })
})
