// Pure caption functions (Epic 11, #117): chunking words into caption blocks, and split and merge of
// blocks. No I/O, so export and the preview can reuse them. Times are timeline milliseconds.
import type { CaptionBlock, CaptionWord } from './captionBlock'

// A caption ends after a word that ends a clause or sentence.
const BREAK_PUNCTUATION = /[.!?,;:—–]["')\]]*$/

export const DEFAULT_MAX_WORDS_PER_CAPTION = 4
// A silence this long or longer between two words always starts a new caption.
export const DEFAULT_PAUSE_BREAK_MS = 350

export interface ChunkOptions {
  // The most words a caption may hold. Must be a whole number of at least 1.
  maxWords?: number
  // The silence, in ms, between a word's end and the next word's start that forces a break.
  pauseBreakMs?: number
  // Builds the id of the caption at this index (0-based). Defaults to `caption-1`, `caption-2`, ...
  createId?: (index: number) => string
}

// Groups words into caption blocks in order. A block breaks after a word that ends with punctuation,
// before a word that follows a pause, and when it already holds maxWords words.
export function chunkWordsIntoCaptions(
  words: readonly CaptionWord[],
  options: ChunkOptions = {}
): CaptionBlock[] {
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS_PER_CAPTION
  const pauseBreakMs = options.pauseBreakMs ?? DEFAULT_PAUSE_BREAK_MS
  const createId = options.createId ?? ((index: number) => `caption-${index + 1}`)
  if (!Number.isInteger(maxWords) || maxWords < 1) {
    throw new RangeError('maxWords must be a whole number of at least 1')
  }

  const groups: CaptionWord[][] = []
  let current: CaptionWord[] = []
  words.forEach((word, index) => {
    const previous = words[index - 1]
    const pausedBefore = previous !== undefined && word.startMs - previous.endMs >= pauseBreakMs
    if (current.length > 0 && (pausedBefore || current.length >= maxWords)) {
      groups.push(current)
      current = []
    }
    current.push(word)
    if (BREAK_PUNCTUATION.test(word.text)) {
      groups.push(current)
      current = []
    }
  })
  if (current.length > 0) groups.push(current)

  return groups.map((group, index) => ({ id: createId(index), words: group }))
}

// Splits a block before the word at `wordIndex`. The first part keeps the block's id and style. The
// second part gets `newId`. Returns null when there is no split point (the index is 0 or past the end).
export function splitCaptionBlock(
  block: CaptionBlock,
  wordIndex: number,
  newId: string
): [CaptionBlock, CaptionBlock] | null {
  if (!Number.isInteger(wordIndex) || wordIndex <= 0 || wordIndex >= block.words.length) return null
  const first: CaptionBlock = { ...block, words: block.words.slice(0, wordIndex) }
  const second: CaptionBlock = { id: newId, words: block.words.slice(wordIndex) }
  if (block.styleId !== undefined) second.styleId = block.styleId
  return [first, second]
}

// Merges the block at `index` with the block after it. The merged block keeps the first block's id
// and style. Returns a new list, or the same list when there is no next block to merge with.
export function mergeCaptionBlocks(blocks: readonly CaptionBlock[], index: number): CaptionBlock[] {
  const first = blocks[index]
  const second = blocks[index + 1]
  if (!Number.isInteger(index) || index < 0 || first === undefined || second === undefined) {
    return [...blocks]
  }
  const merged: CaptionBlock = { ...first, words: [...first.words, ...second.words] }
  return [...blocks.slice(0, index), merged, ...blocks.slice(index + 2)]
}
