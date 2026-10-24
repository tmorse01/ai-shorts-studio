import { describe, expect, it } from 'vitest'
import type { CaptionBlock, CaptionWord } from '@shared/captions/captionBlock'
import { captionBlockSchema } from '@shared/captions/captionBlock'
import {
  chunkWordsIntoCaptions,
  mergeCaptionBlocks,
  splitCaptionBlock
} from '@shared/captions/captionEdits'

function word(text: string, startMs: number, endMs: number): CaptionWord {
  return { text, startMs, endMs }
}

// Words back to back, 100 ms each, with no gaps.
function run(...texts: string[]): CaptionWord[] {
  return texts.map((text, index) => word(text, index * 100, index * 100 + 100))
}

function texts(blocks: CaptionBlock[]): string[][] {
  return blocks.map((block) => block.words.map((item) => item.text))
}

describe('chunkWordsIntoCaptions', () => {
  it('returns no blocks for no words', () => {
    expect(chunkWordsIntoCaptions([])).toEqual([])
  })

  it('caps each caption at maxWords', () => {
    const blocks = chunkWordsIntoCaptions(run('a', 'b', 'c', 'd', 'e'), { maxWords: 2 })
    expect(texts(blocks)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('uses four words by default', () => {
    const blocks = chunkWordsIntoCaptions(run('a', 'b', 'c', 'd', 'e'))
    expect(texts(blocks)).toEqual([['a', 'b', 'c', 'd'], ['e']])
  })

  it('breaks after words that end with punctuation', () => {
    const blocks = chunkWordsIntoCaptions(run('Hello,', 'world.', 'Next', 'one!'), { maxWords: 9 })
    expect(texts(blocks)).toEqual([['Hello,'], ['world.'], ['Next', 'one!']])
  })

  it('keeps closing quotes after punctuation as a break', () => {
    const blocks = chunkWordsIntoCaptions(run('"Stop."', 'Now'), { maxWords: 9 })
    expect(texts(blocks)).toEqual([['"Stop."'], ['Now']])
  })

  it('breaks before a word that follows a pause of at least pauseBreakMs', () => {
    const words = [word('one', 0, 100), word('two', 150, 250), word('three', 700, 800)]
    const blocks = chunkWordsIntoCaptions(words, { maxWords: 9, pauseBreakMs: 350 })
    expect(texts(blocks)).toEqual([['one', 'two'], ['three']])
  })

  it('does not break on a gap shorter than pauseBreakMs', () => {
    const words = [word('one', 0, 100), word('two', 399, 500)]
    const blocks = chunkWordsIntoCaptions(words, { maxWords: 9, pauseBreakMs: 350 })
    expect(texts(blocks)).toEqual([['one', 'two']])
  })

  it('creates ids from createId, and by default in order', () => {
    expect(chunkWordsIntoCaptions(run('a', 'b'), { maxWords: 1 }).map((b) => b.id)).toEqual([
      'caption-1',
      'caption-2'
    ])
    const custom = chunkWordsIntoCaptions(run('a', 'b'), {
      maxWords: 1,
      createId: (index) => `cap_${index}`
    })
    expect(custom.map((b) => b.id)).toEqual(['cap_0', 'cap_1'])
  })

  it('produces blocks that pass the caption schema', () => {
    const blocks = chunkWordsIntoCaptions(run('a', 'b,', 'c'))
    for (const block of blocks) expect(captionBlockSchema.safeParse(block).success).toBe(true)
  })

  it('rejects a maxWords below 1 or not a whole number', () => {
    expect(() => chunkWordsIntoCaptions(run('a'), { maxWords: 0 })).toThrow(RangeError)
    expect(() => chunkWordsIntoCaptions(run('a'), { maxWords: 1.5 })).toThrow(RangeError)
  })
})

describe('splitCaptionBlock', () => {
  const block: CaptionBlock = {
    id: 'c1',
    words: run('a', 'b', 'c'),
    styleId: 'bold'
  }

  it('splits before the given word, keeping the id and style on the first part', () => {
    const result = splitCaptionBlock(block, 1, 'c2')
    expect(result).not.toBeNull()
    const [first, second] = result as [CaptionBlock, CaptionBlock]
    expect(texts([first, second])).toEqual([['a'], ['b', 'c']])
    expect(first.id).toBe('c1')
    expect(second.id).toBe('c2')
    expect(second.styleId).toBe('bold')
  })

  it('does not change the original block', () => {
    splitCaptionBlock(block, 2, 'c2')
    expect(block.words).toHaveLength(3)
  })

  it('returns null at the start, at the end, or out of range', () => {
    expect(splitCaptionBlock(block, 0, 'c2')).toBeNull()
    expect(splitCaptionBlock(block, 3, 'c2')).toBeNull()
    expect(splitCaptionBlock(block, -1, 'c2')).toBeNull()
    expect(splitCaptionBlock(block, 1.5, 'c2')).toBeNull()
  })
})

describe('mergeCaptionBlocks', () => {
  const blocks: CaptionBlock[] = [
    { id: 'c1', words: run('a', 'b') },
    { id: 'c2', words: [word('c', 300, 400)], styleId: 'plain' },
    { id: 'c3', words: [word('d', 500, 600)] }
  ]

  it('merges the block at index with the next one, keeping the first id and style', () => {
    const merged = mergeCaptionBlocks(blocks, 0)
    expect(merged.map((b) => b.id)).toEqual(['c1', 'c3'])
    expect(texts(merged)).toEqual([['a', 'b', 'c'], ['d']])
    expect(merged[0]?.styleId).toBeUndefined()
  })

  it('keeps the style of the first block when merging later blocks', () => {
    const merged = mergeCaptionBlocks(blocks, 1)
    expect(merged[1]?.id).toBe('c2')
    expect(merged[1]?.styleId).toBe('plain')
    expect(texts(merged)).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('returns the same blocks when there is no next block', () => {
    expect(mergeCaptionBlocks(blocks, 2)).toEqual(blocks)
    expect(mergeCaptionBlocks(blocks, -1)).toEqual(blocks)
  })

  it('does not mutate the input list', () => {
    mergeCaptionBlocks(blocks, 0)
    expect(blocks.map((b) => b.id)).toEqual(['c1', 'c2', 'c3'])
  })
})
