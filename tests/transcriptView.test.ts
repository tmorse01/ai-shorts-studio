import { describe, expect, it } from 'vitest'
import type { Transcript, TranscriptWord } from '@shared/analysis/transcript'
import {
  HIGHLIGHT_HOLD_MS,
  currentWordIndex,
  deriveTranscriptState,
  transcriptLines,
  wordRangeFromIndices
} from '@renderer/features/transcript/transcriptView'

const words: TranscriptWord[] = [
  { text: 'Hello', startMs: 0, endMs: 400 },
  { text: 'there.', startMs: 450, endMs: 900 },
  { text: 'Next', startMs: 2500, endMs: 2800 }
]

describe('currentWordIndex', () => {
  it('finds the word that spans the playhead', () => {
    expect(currentWordIndex(words, 0)).toBe(0)
    expect(currentWordIndex(words, 600)).toBe(1)
    expect(currentWordIndex(words, 2600)).toBe(2)
  })

  it('holds the last word briefly after it ends, then clears', () => {
    expect(currentWordIndex(words, 900 + HIGHLIGHT_HOLD_MS - 1)).toBe(1)
    expect(currentWordIndex(words, 900 + HIGHLIGHT_HOLD_MS)).toBe(-1)
  })

  it('returns -1 before the first word and for an empty transcript', () => {
    expect(currentWordIndex(words, -10)).toBe(-1)
    expect(currentWordIndex([], 500)).toBe(-1)
  })
})

describe('wordRangeFromIndices', () => {
  it('spans from the first word start to the last word end, in either order', () => {
    expect(wordRangeFromIndices(words, 0, 1)).toEqual({ startMs: 0, endMs: 900 })
    expect(wordRangeFromIndices(words, 2, 1)).toEqual({ startMs: 450, endMs: 2800 })
  })

  it('maps a single word to its own range', () => {
    expect(wordRangeFromIndices(words, 2, 2)).toEqual({ startMs: 2500, endMs: 2800 })
  })

  it('returns undefined when an index is not a word', () => {
    expect(wordRangeFromIndices(words, 0, 7)).toBeUndefined()
    expect(wordRangeFromIndices([], 0, 0)).toBeUndefined()
  })
})

describe('transcriptLines', () => {
  const transcript: Transcript = {
    version: 1,
    words,
    segments: [
      { text: 'Hello there.', startMs: 0, endMs: 900 },
      { text: 'Next', startMs: 2500, endMs: 2800 }
    ]
  }

  it('starts a new line at each segment', () => {
    const lines = transcriptLines(transcript)
    expect(lines.map((line) => line.words.map((entry) => entry.index))).toEqual([[0, 1], [2]])
    expect(lines.map((line) => line.firstIndex)).toEqual([0, 2])
  })

  it('puts every word on one line when there are no segments', () => {
    const lines = transcriptLines({ ...transcript, segments: [] })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.words).toHaveLength(3)
  })

  it('returns no lines for an empty transcript', () => {
    expect(transcriptLines({ version: 1, words: [], segments: [] })).toEqual([])
  })
})

describe('deriveTranscriptState', () => {
  const transcript: Transcript = { version: 1, words, segments: [] }
  const silent: Transcript = { version: 1, words: [], segments: [] }

  it('shows running and failed from the stage', () => {
    expect(deriveTranscriptState({ status: 'running', transcript: undefined })).toEqual({
      kind: 'running'
    })
    expect(
      deriveTranscriptState({ status: 'failed', errorMessage: 'Model missing', transcript: null })
    ).toEqual({ kind: 'failed', message: 'Model missing' })
    expect(deriveTranscriptState({ status: 'failed', transcript: null })).toEqual({
      kind: 'failed',
      message: 'Transcription failed.'
    })
  })

  it('shows not analyzed before the stage runs, or when there is no record', () => {
    expect(deriveTranscriptState({ status: undefined, transcript: undefined })).toEqual({
      kind: 'not-analyzed'
    })
    expect(deriveTranscriptState({ status: 'pending', transcript: undefined })).toEqual({
      kind: 'not-analyzed'
    })
    expect(deriveTranscriptState({ status: 'skipped', transcript: undefined })).toEqual({
      kind: 'not-analyzed'
    })
  })

  it('shows not analyzed when a done stage has lost its cache file', () => {
    expect(deriveTranscriptState({ status: 'done', transcript: null })).toEqual({
      kind: 'not-analyzed'
    })
  })

  it('waits while a done stage transcript is still loading', () => {
    expect(deriveTranscriptState({ status: 'done', transcript: undefined })).toEqual({
      kind: 'loading'
    })
  })

  it('shows no speech for a finished transcript without words', () => {
    expect(deriveTranscriptState({ status: 'done', transcript: silent })).toEqual({
      kind: 'no-speech'
    })
  })

  it('shows the transcript when a done stage has words', () => {
    expect(deriveTranscriptState({ status: 'done', transcript })).toEqual({
      kind: 'ready',
      transcript
    })
  })

  it('shows a failed state when the transcript could not be read', () => {
    expect(
      deriveTranscriptState({
        status: 'done',
        transcript: null,
        readError: 'Could not read the transcript.'
      })
    ).toEqual({ kind: 'failed', message: 'Could not read the transcript.' })
  })
})
