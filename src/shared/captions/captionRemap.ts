// Turns transcript words into caption words on the timeline (Epic 11, #118). A clip plays source time
// sourceInMs onwards from startMs on the timeline, so a source word maps to timeline time by the clip's
// offset. Pure functions, no I/O.
import type { TranscriptWord } from '../analysis/transcript'
import type { CaptionBlock, CaptionWord } from './captionBlock'
import { chunkWordsIntoCaptions, type ChunkOptions } from './captionEdits'

// The part of a clip that captions need: where it sits on the timeline and which source it plays.
export interface CaptionSourceClip {
  mediaId: string
  startMs: number
  durationMs: number
  sourceInMs: number
}

/** The transcript words of each media item, keyed by media id. A missing key means no transcript. */
export type TranscriptWordsByMedia = ReadonlyMap<string, readonly TranscriptWord[]>

// Maps one clip's words to timeline time. A word belongs to the clip when it starts inside the clip's
// source window. A word that runs past the window is cut at the window's end.
export function remapClipWords(
  words: readonly TranscriptWord[],
  clip: CaptionSourceClip
): CaptionWord[] {
  const sourceEnd = clip.sourceInMs + clip.durationMs
  const offset = clip.startMs - clip.sourceInMs
  const mapped: CaptionWord[] = []
  for (const word of words) {
    if (word.startMs < clip.sourceInMs || word.startMs >= sourceEnd) continue
    const startMs = word.startMs + offset
    const endMs = Math.max(word.startMs, Math.min(word.endMs, sourceEnd)) + offset
    mapped.push({ text: word.text, startMs, endMs })
  }
  return mapped
}

// The caption words of a list of clips, in timeline order. A clip whose media has no transcript adds
// nothing.
export function captionWordsForClips(
  clips: readonly CaptionSourceClip[],
  wordsByMedia: TranscriptWordsByMedia
): CaptionWord[] {
  return [...clips]
    .sort((a, b) => a.startMs - b.startMs)
    .flatMap((clip) => {
      const words = wordsByMedia.get(clip.mediaId)
      return words ? remapClipWords(words, clip) : []
    })
}

/** The timeline span the clips cover, or undefined when there are none. */
export function clipsSpan(
  clips: readonly CaptionSourceClip[]
): { startMs: number; endMs: number } | undefined {
  if (clips.length === 0) return undefined
  return {
    startMs: Math.min(...clips.map((clip) => clip.startMs)),
    endMs: Math.max(...clips.map((clip) => clip.startMs + clip.durationMs))
  }
}

/** Caption blocks for a list of clips. Each block gets an id from createId. */
export function captionBlocksForClips(
  clips: readonly CaptionSourceClip[],
  wordsByMedia: TranscriptWordsByMedia,
  createId: () => string,
  options: Omit<ChunkOptions, 'createId'> = {}
): CaptionBlock[] {
  const words = captionWordsForClips(clips, wordsByMedia)
  return chunkWordsIntoCaptions(words, { ...options, createId: () => createId() })
}

// The start of a block, which decides which range it belongs to.
function blockStartMs(block: CaptionBlock): number {
  return block.words[0]?.startMs ?? 0
}

// Replaces the blocks that start inside [rangeStartMs, rangeEndMs) with `next`. Blocks outside the
// range are kept as they are. The result is sorted by start time.
export function replaceCaptionsInRange(
  blocks: readonly CaptionBlock[],
  rangeStartMs: number,
  rangeEndMs: number,
  next: readonly CaptionBlock[]
): CaptionBlock[] {
  const kept = blocks.filter((block) => {
    const start = blockStartMs(block)
    return start < rangeStartMs || start >= rangeEndMs
  })
  return [...kept, ...next].sort((a, b) => blockStartMs(a) - blockStartMs(b))
}
