// The transcript tab's pure rules: which word the playhead is on, which words a text selection covers,
// how the words group into lines, and which state the tab shows for a clip. No DOM and no React, so the
// rules are tested directly.
import type { AnalysisStageStatus } from '@shared/analysis/analysis'
import type { Transcript, TranscriptWord } from '@shared/analysis/transcript'

// After a word ends, it stays highlighted this long, so the highlight does not blink between words.
export const HIGHLIGHT_HOLD_MS = 1000

/**
 * The index of the word the playhead is on, or -1 when no word is current. Words are in time order.
 * A word is current from its start until its end, plus a short hold for the pause after it.
 */
export function currentWordIndex(words: readonly TranscriptWord[], playheadMs: number): number {
  let low = 0
  let high = words.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const word = words[middle]
    if (word && word.startMs <= playheadMs) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (found < 0) return -1
  const word = words[found]
  if (!word) return -1
  const end = Math.max(word.endMs, word.startMs + 1)
  return playheadMs < end + HIGHLIGHT_HOLD_MS ? found : -1
}

/**
 * The time range covered by two word indexes, in either order. Undefined when an index is not a word,
 * so a selection that misses the words sets no In or Out.
 */
export function wordRangeFromIndices(
  words: readonly TranscriptWord[],
  anchorIndex: number,
  focusIndex: number
): { startMs: number; endMs: number } | undefined {
  const first = words[Math.min(anchorIndex, focusIndex)]
  const last = words[Math.max(anchorIndex, focusIndex)]
  if (!first || !last) return undefined
  return { startMs: first.startMs, endMs: last.endMs }
}

export interface TranscriptLine {
  // Index of the first word in the line, in the transcript's word list.
  firstIndex: number
  words: { index: number; word: TranscriptWord }[]
}

/**
 * Groups the words into lines, one per segment. A word joins the last segment that starts at or
 * before it, so the grouping holds even when segment times overlap. Without segments, all words form
 * one line.
 */
export function transcriptLines(transcript: Transcript): TranscriptLine[] {
  const lines: TranscriptLine[] = []
  const segments = transcript.segments
  let segmentIndex = 0
  let lineSegment = -1
  transcript.words.forEach((word, index) => {
    while (
      segmentIndex + 1 < segments.length &&
      word.startMs >= (segments[segmentIndex + 1]?.startMs ?? Number.POSITIVE_INFINITY)
    ) {
      segmentIndex += 1
    }
    const current = lines[lines.length - 1]
    if (current && lineSegment === segmentIndex) {
      current.words.push({ index, word })
    } else {
      lines.push({ firstIndex: index, words: [{ index, word }] })
      lineSegment = segmentIndex
    }
  })
  return lines
}

/** What the transcript tab shows for a clip. */
export type TranscriptViewState =
  | { kind: 'not-analyzed' }
  | { kind: 'loading' }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'no-speech' }
  | { kind: 'ready'; transcript: Transcript }

export interface TranscriptViewInput {
  // The transcript stage's status for the clip. Undefined when the clip has no analysis record yet.
  status: AnalysisStageStatus | undefined
  // The stage's error message, when it failed.
  errorMessage?: string
  // The cached transcript: undefined while it loads, null when there is none on disk.
  transcript: Transcript | null | undefined
  // A failure to read the transcript from disk, shown as a failed state.
  readError?: string
}

/**
 * The state of the transcript tab. Running and failed come from the stage. A finished stage shows the
 * transcript, or no speech when it has no words. Anything not yet analyzed, or with its cache gone, is
 * not analyzed.
 */
export function deriveTranscriptState(input: TranscriptViewInput): TranscriptViewState {
  const { status } = input
  if (status === 'running') return { kind: 'running' }
  if (status === 'failed') {
    return { kind: 'failed', message: input.errorMessage ?? 'Transcription failed.' }
  }
  if (status !== 'done') return { kind: 'not-analyzed' }
  if (input.readError !== undefined) return { kind: 'failed', message: input.readError }
  if (input.transcript === undefined) return { kind: 'loading' }
  if (input.transcript === null) return { kind: 'not-analyzed' }
  if (input.transcript.words.length === 0) return { kind: 'no-speech' }
  return { kind: 'ready', transcript: input.transcript }
}
