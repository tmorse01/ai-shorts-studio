import { describe, expect, it } from 'vitest'
import { buildSrt, srtFileName, srtTimestamp } from '../src/shared/captions/srt'
import type { CaptionBlock } from '../src/shared/captions/captionBlock'
import type { Timeline } from '../src/shared/timeline/timeline'

function block(id: string, words: [string, number, number][]): CaptionBlock {
  return {
    id,
    words: words.map(([text, startMs, endMs]) => ({ text, startMs, endMs }))
  }
}

function timeline(...tracks: { role: string; captions?: CaptionBlock[] }[]): Timeline {
  return {
    tracks: tracks.map((track, index) => ({
      id: `track-${index}`,
      kind: 'text',
      role: track.role,
      muted: false,
      clips: [],
      captions: track.captions
    }))
  } as unknown as Timeline
}

describe('srtTimestamp', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000')
    expect(srtTimestamp(1234)).toBe('00:00:01,234')
    expect(srtTimestamp(61_005)).toBe('00:01:01,005')
    expect(srtTimestamp(3_723_456)).toBe('01:02:03,456')
  })

  it('clamps negative and rounds fractional milliseconds', () => {
    expect(srtTimestamp(-5)).toBe('00:00:00,000')
    expect(srtTimestamp(999.6)).toBe('00:00:01,000')
  })
})

describe('buildSrt', () => {
  it('returns an empty document when the timeline has no captions', () => {
    expect(buildSrt(timeline({ role: 'main' }))).toBe('')
    expect(buildSrt(timeline({ role: 'captions', captions: [] }))).toBe('')
  })

  it('numbers cues, times them on the timeline and joins their words', () => {
    const srt = buildSrt(
      timeline({
        role: 'captions',
        captions: [
          block('b1', [
            ['Hello', 0, 400],
            ['there.', 450, 1200]
          ]),
          block('b2', [['Next', 1500, 2000]])
        ]
      })
    )
    expect(srt).toBe(
      [
        '1',
        '00:00:00,000 --> 00:00:01,200',
        'Hello there.',
        '',
        '2',
        '00:00:01,500 --> 00:00:02,000',
        'Next',
        ''
      ].join('\n')
    )
  })

  it('orders cues by start time across captions tracks, and ignores other tracks', () => {
    const srt = buildSrt(
      timeline(
        { role: 'captions', captions: [block('late', [['B', 5000, 5500]])] },
        { role: 'main', captions: [block('ignored', [['X', 0, 100]])] },
        { role: 'captions', captions: [block('early', [['A', 1000, 1500]])] }
      )
    )
    expect(srt).toContain(
      '1\n00:00:01,000 --> 00:00:01,500\nA\n\n2\n00:00:05,000 --> 00:00:05,500\nB\n'
    )
    expect(srt).not.toContain('X')
  })
})

describe('srtFileName', () => {
  it('uses the short name and drops characters Windows does not allow', () => {
    expect(srtFileName('Launch: day 1?')).toBe('Launch day 1.srt')
  })

  it('falls back to captions when the name leaves nothing', () => {
    expect(srtFileName(' ??? ')).toBe('captions.srt')
  })
})
