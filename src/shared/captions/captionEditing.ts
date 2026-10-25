// Edits to caption blocks on the Captions lane (Epic 11, #120): retiming words when the text changes,
// moving and trimming a block, and splitting or merging blocks at a time. Pure functions of blocks and
// milliseconds, no I/O. Each returns the same array when the edit changes nothing, so the caller can
// skip the history entry.
import type { CaptionBlock, CaptionWord } from './captionBlock'
import { mergeCaptionBlocks, splitCaptionBlock } from './captionEdits'
import { blockSpanMs } from './captionTiming'

// The shortest a block may be made by a trim, in ms.
export const MIN_CAPTION_MS = 100

// The text a word is matched on when a caption's text is edited: lower case, with leading and trailing
// punctuation removed, so a word with a comma still matches the same word without it.
function matchKey(text: string): string {
  return text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

// Pairs of [oldIndex, newIndex] for the longest run of matching words, in order.
function matchedPairs(oldKeys: readonly string[], newKeys: readonly string[]): [number, number][] {
  const n = oldKeys.length
  const m = newKeys.length
  // table[i][j] is the length of the longest common run of oldKeys[i..] and newKeys[j..].
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        oldKeys[i] === newKeys[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldKeys[i] === newKeys[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

// Words for new text. A word that matches a word of the old text keeps that word's timing, so an edit
// that fixes a spelling or adds a word leaves the rest in step. Words without a match share out the time
// between their neighbours (the previous matched word's end and the next matched word's start) evenly.
// Returns [] when there is nothing to time.
export function retimeCaptionWords(
  words: readonly CaptionWord[],
  texts: readonly string[]
): CaptionWord[] {
  const first = words[0]
  const last = words[words.length - 1]
  if (first === undefined || last === undefined || texts.length === 0) return []

  const pairs = matchedPairs(
    words.map((word) => matchKey(word.text)),
    texts.map(matchKey)
  )
  const result: CaptionWord[] = new Array<CaptionWord>(texts.length)
  for (const [oldIndex, newIndex] of pairs) {
    const source = words[oldIndex]
    result[newIndex] = { text: texts[newIndex], startMs: source.startMs, endMs: source.endMs }
  }

  // Walk the matched words in order. Before each one, share out the unmatched new words that come
  // before it, between the previous matched word's end and its start. After the last one, the block's
  // end closes the run.
  let previousEnd = first.startMs
  let nextNew = 0
  for (let p = 0; p <= pairs.length; p++) {
    const matched = p < pairs.length
    const oldIndex = matched ? pairs[p][0] : words.length
    const matchIndex = matched ? pairs[p][1] : texts.length
    const spanStart = previousEnd
    const spanEnd = Math.max(spanStart, matched ? words[oldIndex].startMs : last.endMs)
    const count = matchIndex - nextNew
    const span = spanEnd - spanStart
    for (let k = 0; k < count; k++) {
      result[nextNew + k] = {
        text: texts[nextNew + k],
        startMs: spanStart + Math.round((span * k) / count),
        endMs: spanStart + Math.round((span * (k + 1)) / count)
      }
    }
    if (matched) {
      previousEnd = words[oldIndex].endMs
      nextNew = matchIndex + 1
    }
  }
  return result
}

// The block with its text replaced by `text`, its words retimed. Returns null when the text has no
// words, so an empty edit is refused and the caller keeps the block as it was.
export function editCaptionText(block: CaptionBlock, text: string): CaptionBlock | null {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return null
  return { ...block, words: retimeCaptionWords(block.words, tokens) }
}

function indexOfBlock(blocks: readonly CaptionBlock[], blockId: string): number {
  return blocks.findIndex((block) => block.id === blockId)
}

// Moves a block in time by deltaMs. It stops at 0 and at its neighbours, so blocks never overlap.
// Every word moves with it.
export function moveCaptionBlock(
  blocks: readonly CaptionBlock[],
  blockId: string,
  deltaMs: number
): CaptionBlock[] {
  const index = indexOfBlock(blocks, blockId)
  if (index < 0 || !Number.isFinite(deltaMs)) return blocks as CaptionBlock[]
  const block = blocks[index]
  const { startMs, endMs } = blockSpanMs(block)
  const previous = blocks[index - 1]
  const next = blocks[index + 1]
  const floor = previous ? blockSpanMs(previous).endMs : 0
  const ceiling = next ? blockSpanMs(next).startMs : Infinity
  const minDelta = floor - startMs
  const maxDelta = ceiling - endMs
  if (maxDelta < minDelta) return blocks as CaptionBlock[]
  const delta = Math.round(Math.min(Math.max(deltaMs, minDelta), maxDelta))
  if (delta === 0) return blocks as CaptionBlock[]
  const moved: CaptionBlock = {
    ...block,
    words: block.words.map((word) => ({
      ...word,
      startMs: word.startMs + delta,
      endMs: word.endMs + delta
    }))
  }
  return blocks.map((item, position) => (position === index ? moved : item))
}

// Trims one edge of a block to `ms`. The start edge drops words that end before it and starts the first
// kept word there. The end edge drops words that start after it and ends the last kept word there. The
// edge stops at the neighbouring block and keeps at least MIN_CAPTION_MS of block. Extending an edge
// stretches the first or last word into the space.
export function trimCaptionBlock(
  blocks: readonly CaptionBlock[],
  blockId: string,
  edge: 'start' | 'end',
  ms: number
): CaptionBlock[] {
  const index = indexOfBlock(blocks, blockId)
  if (index < 0 || !Number.isFinite(ms)) return blocks as CaptionBlock[]
  const block = blocks[index]
  const { startMs, endMs } = blockSpanMs(block)
  const previous = blocks[index - 1]
  const next = blocks[index + 1]
  const floor = previous ? blockSpanMs(previous).endMs : 0
  const ceiling = next ? blockSpanMs(next).startMs : Infinity
  const target = Math.round(ms)

  let trimmed: CaptionBlock
  if (edge === 'start') {
    const upper = endMs - MIN_CAPTION_MS
    if (upper < floor) return blocks as CaptionBlock[]
    const newStart = Math.min(Math.max(target, floor), upper)
    const kept = block.words.filter((word) => word.endMs > newStart)
    trimmed = {
      ...block,
      words: kept.map((word, position) => {
        const wordStart = position === 0 ? newStart : Math.max(word.startMs, newStart)
        return { ...word, startMs: wordStart, endMs: Math.max(word.endMs, wordStart) }
      })
    }
  } else {
    const lower = startMs + MIN_CAPTION_MS
    if (lower > ceiling) return blocks as CaptionBlock[]
    const newEnd = Math.min(Math.max(target, lower), ceiling)
    const kept = block.words.filter((word) => word.startMs < newEnd)
    const lastIndex = kept.length - 1
    trimmed = {
      ...block,
      words: kept.map((word, position) =>
        position === lastIndex
          ? { ...word, endMs: newEnd }
          : { ...word, endMs: Math.min(word.endMs, newEnd) }
      )
    }
  }
  if (trimmed.words.length === 0) return blocks as CaptionBlock[]
  return blocks.map((item, position) => (position === index ? trimmed : item))
}

// Splits a block before the first word that starts at or after `ms`, such as the playhead. The first
// part keeps the block's id and the second gets `newId`. Returns the same list when there is no word
// boundary to split at.
export function splitCaptionAtMs(
  blocks: readonly CaptionBlock[],
  blockId: string,
  ms: number,
  newId: string
): CaptionBlock[] {
  const index = indexOfBlock(blocks, blockId)
  if (index < 0 || !Number.isFinite(ms)) return blocks as CaptionBlock[]
  const block = blocks[index]
  const wordIndex = block.words.findIndex((word) => word.startMs >= ms)
  const parts = splitCaptionBlock(block, wordIndex, newId)
  if (!parts) return blocks as CaptionBlock[]
  return [...blocks.slice(0, index), parts[0], parts[1], ...blocks.slice(index + 1)]
}

// Merges a block with the block after it. Returns the same list when there is no next block.
export function mergeCaptionWithNext(
  blocks: readonly CaptionBlock[],
  blockId: string
): CaptionBlock[] {
  const index = indexOfBlock(blocks, blockId)
  if (index < 0 || index + 1 >= blocks.length) return blocks as CaptionBlock[]
  return mergeCaptionBlocks(blocks, index)
}
