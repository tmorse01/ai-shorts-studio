// The speech-to-text result for one media item: words with their timings, and the words grouped into
// segments (sentences or phrases). Pure, so the token-to-word mapping can be tested without the model.
import { z } from 'zod'

export const TRANSCRIPT_VERSION = 1

export const transcriptWordSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative()
})
export type TranscriptWord = z.infer<typeof transcriptWordSchema>

export const transcriptSegmentSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative()
})
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const transcriptSchema = z.object({
  version: z.literal(TRANSCRIPT_VERSION),
  words: z.array(transcriptWordSchema),
  segments: z.array(transcriptSegmentSchema)
})
export type Transcript = z.infer<typeof transcriptSchema>

/**
 * What the speech model reports. Tokens are subword pieces; a piece that starts with the word mark
 * (U+2581) begins a new word. Timestamps and durations are in seconds from the start of the audio.
 */
export interface RawSpeechResult {
  text: string
  tokens: string[]
  timestamps: number[]
  durations?: number[]
}

export const WORD_MARK = '▁'

// A pause this long (in ms) between two words starts a new segment.
export const SEGMENT_GAP_MS = 800
// A segment never holds more words than this, even without a pause.
export const SEGMENT_MAX_WORDS = 14

export function emptyTranscript(): Transcript {
  return { version: TRANSCRIPT_VERSION, words: [], segments: [] }
}

// Model control tokens such as <unk> or <blk> are not spoken words.
function isControlToken(token: string): boolean {
  return /^<.*>$/.test(token)
}

interface OpenWord {
  text: string
  startSec: number
  endSec: number
}

function toMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000))
}

/** Joins the model's subword tokens into words with millisecond timings. */
export function tokensToWords(raw: RawSpeechResult): TranscriptWord[] {
  const count = Math.min(raw.tokens.length, raw.timestamps.length)
  const words: TranscriptWord[] = []
  let open: OpenWord | undefined

  const close = (): void => {
    if (!open) return
    const text = open.text.trim()
    if (text) {
      const startMs = toMs(open.startSec)
      words.push({ text, startMs, endMs: Math.max(startMs, toMs(open.endSec)) })
    }
    open = undefined
  }

  for (let i = 0; i < count; i += 1) {
    const token = raw.tokens[i] ?? ''
    const start = raw.timestamps[i] ?? Number.NaN
    if (isControlToken(token) || !Number.isFinite(start)) continue

    const duration = raw.durations?.[i]
    const nextStart = i + 1 < count ? raw.timestamps[i + 1] : undefined
    const end =
      duration !== undefined && Number.isFinite(duration) && duration >= 0
        ? start + duration
        : nextStart !== undefined && Number.isFinite(nextStart)
          ? Math.max(start, nextStart)
          : start

    const piece = token.split(WORD_MARK).join('')
    if (token.startsWith(WORD_MARK) || !open) {
      close()
      open = { text: piece, startSec: start, endSec: end }
    } else {
      open.text += piece
      open.endSec = end
    }
  }
  close()
  return words
}

const SENTENCE_END = /[.!?]$/

/** Groups words into segments. A segment ends at a long pause, a sentence end, or the word limit. */
export function groupSegments(words: readonly TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let bucket: TranscriptWord[] = []
  const flush = (): void => {
    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    if (!first || !last) return
    segments.push({
      text: bucket.map((word) => word.text).join(' '),
      startMs: first.startMs,
      endMs: last.endMs
    })
    bucket = []
  }

  for (const [index, word] of words.entries()) {
    bucket.push(word)
    const next = words[index + 1]
    const pause = next ? next.startMs - word.endMs : Number.POSITIVE_INFINITY
    if (
      !next ||
      pause >= SEGMENT_GAP_MS ||
      SENTENCE_END.test(word.text) ||
      bucket.length >= SEGMENT_MAX_WORDS
    ) {
      flush()
    }
  }
  return segments
}

/** The transcript for one media item. No speech gives an empty transcript, not an error. */
export function buildTranscript(raw: RawSpeechResult): Transcript {
  const words = tokensToWords(raw)
  return { version: TRANSCRIPT_VERSION, words, segments: groupSegments(words) }
}
