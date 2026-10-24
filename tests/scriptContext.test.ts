import { describe, expect, it } from 'vitest'
import {
  buildScriptContext,
  estimateTokens,
  formatClock,
  type ScriptContextInput,
  type ShotNote,
  type TranscriptExcerpt
} from '@shared/ai/scriptContext'

const excerpt = (mediaName: string, startSec: number, text: string): TranscriptExcerpt => ({
  mediaName,
  startSec,
  text
})

const shot = (
  mediaName: string,
  shotIndex: number,
  startSec: number,
  description: string
): ShotNote => ({
  mediaName,
  shotIndex,
  startSec,
  endSec: startSec + 4,
  description,
  tags: ['outdoor']
})

function input(overrides: Partial<ScriptContextInput> = {}): ScriptContextInput {
  return { topic: 'Harbour at dawn', transcript: [], shots: [], ...overrides }
}

describe('estimateTokens', () => {
  it('rounds up at about four characters to a token', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('formatClock', () => {
  it('formats whole seconds as m:ss and never goes negative', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('buildScriptContext header', () => {
  it('writes the topic, target length, tone and notes that are set', () => {
    const context = buildScriptContext(
      input({ targetSeconds: 60, tone: '  calm   and  warm ', notes: 'Open on the boats.' })
    )
    expect(context.text).toBe(
      [
        'Topic: Harbour at dawn',
        'Target length: about 60 sec',
        'Tone: calm and warm',
        'Notes: Open on the boats.'
      ].join('\n')
    )
  })

  it('leaves out blank fields and a zero target', () => {
    const context = buildScriptContext(
      input({ topic: '   ', targetSeconds: 0, tone: '', notes: '  ' })
    )
    expect(context.text).toBe('')
    expect(context.tokens).toBe(0)
  })

  it('keeps the user header even when the footage has no room left', () => {
    const footage = [excerpt('a.mp4', 0, 'word '.repeat(200))]
    const context = buildScriptContext(input({ notes: 'Keep this.', transcript: footage }), 10)
    expect(context.text).toContain('Notes: Keep this.')
    expect(context.transcriptUsed).toBe(0)
    expect(context.transcriptDropped).toBe(1)
  })
})

describe('buildScriptContext footage', () => {
  it('skips footage with no text', () => {
    const context = buildScriptContext(
      input({
        transcript: [excerpt('a.mp4', 1, '   ')],
        shots: [shot('a.mp4', 0, 0, '')]
      })
    )
    expect(context.transcriptUsed).toBe(0)
    expect(context.shotsUsed).toBe(0)
    expect(context.transcriptDropped).toBe(0)
    expect(context.shotsDropped).toBe(0)
  })

  it('orders footage by media name and then by time, not input order', () => {
    const context = buildScriptContext(
      input({
        transcript: [
          excerpt('b.mp4', 5, 'second clip line'),
          excerpt('a.mp4', 20, 'late line'),
          excerpt('a.mp4', 2, 'early line')
        ]
      })
    )
    const lines = context.text.split('\n').filter((line) => line.startsWith('- '))
    expect(lines).toEqual([
      '- [a.mp4, 0:02] early line',
      '- [a.mp4, 0:20] late line',
      '- [b.mp4, 0:05] second clip line'
    ])
  })

  it('writes shot numbers from one, with the time range and tags', () => {
    const context = buildScriptContext(
      input({ shots: [shot('cam.mp4', 2, 75, 'A boat leaves the pier.')] })
    )
    expect(context.text).toContain(
      'Shot descriptions:\n- [cam.mp4, shot 3, 1:15-1:19] A boat leaves the pier. (outdoor)'
    )
  })

  it('gives transcript and shots a turn each when the budget is tight', () => {
    const transcript = Array.from({ length: 10 }, (_, index) =>
      excerpt('a.mp4', index, `transcript line number ${index} ${'x'.repeat(40)}`)
    )
    const shots = Array.from({ length: 10 }, (_, index) =>
      shot('a.mp4', index, index * 5, `shot description number ${index} ${'y'.repeat(40)}`)
    )
    const context = buildScriptContext(input({ transcript, shots }), 300)
    expect(context.transcriptUsed).toBeGreaterThan(0)
    expect(context.shotsUsed).toBeGreaterThan(0)
    expect(context.transcriptUsed + context.transcriptDropped).toBe(10)
    expect(context.shotsUsed + context.shotsDropped).toBe(10)
  })

  it('skips an item that does not fit and still takes a shorter one after it', () => {
    const long = excerpt('a.mp4', 0, 'long '.repeat(100))
    const short = excerpt('a.mp4', 9, 'short line')
    const context = buildScriptContext(input({ transcript: [long, short] }), 120)
    expect(context.text).toContain('short line')
    expect(context.text).not.toContain('long long')
    expect(context.transcriptUsed).toBe(1)
    expect(context.transcriptDropped).toBe(1)
  })
})

describe('buildScriptContext budget', () => {
  it('never returns text over the token budget', () => {
    const transcript = Array.from({ length: 200 }, (_, index) =>
      excerpt(`clip${index % 3}.mp4`, index, `spoken words for line ${index} here`)
    )
    const shots = Array.from({ length: 200 }, (_, index) =>
      shot(`clip${index % 3}.mp4`, index, index, `a detailed view number ${index}`)
    )
    for (const budget of [0, 1, 25, 100, 500, 2000]) {
      // No topic here: the typed header is kept whatever the budget, so the hard limit is tested alone.
      const context = buildScriptContext(input({ topic: '', transcript, shots }), budget)
      expect(context.tokens).toBeLessThanOrEqual(budget)
      expect(estimateTokens(context.text)).toBe(context.tokens)
    }
  })

  it('uses the default budget when none is given', () => {
    const transcript = Array.from({ length: 2000 }, (_, index) =>
      excerpt('a.mp4', index, `line ${index} ${'z'.repeat(60)}`)
    )
    const context = buildScriptContext(input({ transcript }))
    expect(context.tokens).toBeLessThanOrEqual(6000)
    expect(context.transcriptDropped).toBeGreaterThan(0)
  })

  it('is deterministic for the same input', () => {
    const transcript = [excerpt('a.mp4', 3, 'one'), excerpt('a.mp4', 1, 'two')]
    const first = buildScriptContext(input({ transcript }))
    const second = buildScriptContext(input({ transcript: [...transcript] }))
    expect(second).toEqual(first)
  })
})
