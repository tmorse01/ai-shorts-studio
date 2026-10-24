import { describe, expect, it } from 'vitest'
import {
  buildTranscript,
  groupSegments,
  tokensToWords,
  transcriptSchema,
  type TranscriptWord
} from '@shared/analysis/transcript'

describe('tokensToWords', () => {
  it('joins subword pieces into words and turns seconds into milliseconds', () => {
    const words = tokensToWords({
      text: 'Hello world. Bye',
      tokens: ['▁Hel', 'lo', '▁world', '.', '▁Bye'],
      timestamps: [0, 0.2, 0.5, 0.9, 1.2],
      durations: [0.2, 0.3, 0.4, 0.1, 0.3]
    })
    expect(words).toEqual([
      { text: 'Hello', startMs: 0, endMs: 500 },
      { text: 'world.', startMs: 500, endMs: 1000 },
      { text: 'Bye', startMs: 1200, endMs: 1500 }
    ])
  })

  it('takes a word end from the next token when durations are missing', () => {
    const words = tokensToWords({
      text: 'a b',
      tokens: ['▁a', '▁b'],
      timestamps: [0.1, 0.6]
    })
    expect(words).toEqual([
      { text: 'a', startMs: 100, endMs: 600 },
      { text: 'b', startMs: 600, endMs: 600 }
    ])
  })

  it('skips control tokens and tokens without a timestamp', () => {
    const words = tokensToWords({
      text: 'hi',
      tokens: ['<unk>', '▁hi', '<blk>'],
      timestamps: [0, 0.3, Number.NaN]
    })
    expect(words).toEqual([{ text: 'hi', startMs: 300, endMs: 300 }])
  })

  it('starts a word for a piece with no word mark at the very beginning', () => {
    const words = tokensToWords({ text: 'ok', tokens: ['o', 'k'], timestamps: [0, 0.1] })
    expect(words).toEqual([{ text: 'ok', startMs: 0, endMs: 100 }])
  })

  it('ignores extra timestamps beyond the tokens', () => {
    const words = tokensToWords({ text: 'x', tokens: ['▁x'], timestamps: [1, 2, 3] })
    expect(words).toEqual([{ text: 'x', startMs: 1000, endMs: 1000 }])
  })
})

describe('groupSegments', () => {
  const word = (text: string, startMs: number, endMs: number): TranscriptWord => ({
    text,
    startMs,
    endMs
  })

  it('ends a segment at a sentence end and at a long pause', () => {
    const segments = groupSegments([
      word('One.', 0, 400),
      word('two', 450, 700),
      word('three', 2000, 2300)
    ])
    expect(segments).toEqual([
      { text: 'One.', startMs: 0, endMs: 400 },
      { text: 'two', startMs: 450, endMs: 700 },
      { text: 'three', startMs: 2000, endMs: 2300 }
    ])
  })

  it('caps a segment at the word limit', () => {
    const words = Array.from({ length: 20 }, (_, index) =>
      word(`w${index}`, index * 100, index * 100 + 50)
    )
    const segments = groupSegments(words)
    expect(segments.map((segment) => segment.text.split(' ').length)).toEqual([14, 6])
  })
})

describe('buildTranscript', () => {
  it('returns an empty transcript when the model heard nothing', () => {
    const transcript = buildTranscript({ text: '', tokens: [], timestamps: [] })
    expect(transcript).toEqual({ version: 1, words: [], segments: [] })
    expect(transcriptSchema.safeParse(transcript).success).toBe(true)
  })

  it('treats a clip with only control tokens as empty, not as a failure', () => {
    const transcript = buildTranscript({ text: '', tokens: ['<blk>'], timestamps: [0] })
    expect(transcript.words).toEqual([])
    expect(transcript.segments).toEqual([])
  })

  it('produces words and segments that pass the schema', () => {
    const transcript = buildTranscript({
      text: 'Hi there.',
      tokens: ['▁Hi', '▁there', '.'],
      timestamps: [0, 0.4, 0.8],
      durations: [0.3, 0.3, 0.1]
    })
    expect(transcriptSchema.safeParse(transcript).success).toBe(true)
    expect(transcript.segments).toEqual([{ text: 'Hi there.', startMs: 0, endMs: 900 }])
  })
})
