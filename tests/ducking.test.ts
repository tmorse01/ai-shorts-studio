import { describe, expect, it } from 'vitest'
import { gainLinePoints } from '@renderer/features/timeline/clipView'
import {
  DEFAULT_DUCKING,
  duckEnvelope,
  duckingFor,
  duckingSchema,
  envelopeGainAt,
  envelopeWithin,
  narrationRanges
} from '@shared/timeline/ducking'
import { timelineSchema, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }
const duck12 = 10 ** (-12 / 20)

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return { id, mediaId: 'm1', startMs, durationMs, sourceInMs: 0, transform, ...extra }
}

function track(id: string, role: Track['role'], clips: Clip[], extra: Partial<Track> = {}): Track {
  return { id, kind: 'audio', role, muted: false, clips, ...extra }
}

describe('duckingFor', () => {
  it('uses the defaults when the timeline stores none', () => {
    expect(duckingFor({ tracks: [] })).toEqual(DEFAULT_DUCKING)
  })

  it('reads the stored settings', () => {
    const timeline: Timeline = {
      tracks: [],
      ducking: { amountDb: 6, attackMs: 10, releaseMs: 20 }
    }
    expect(duckingFor(timeline)).toEqual({ amountDb: 6, attackMs: 10, releaseMs: 20 })
  })

  it('is part of the timeline schema and rejects out-of-range values', () => {
    expect(timelineSchema.safeParse({ tracks: [], ducking: DEFAULT_DUCKING }).success).toBe(true)
    expect(duckingSchema.safeParse({ ...DEFAULT_DUCKING, amountDb: 30 }).success).toBe(false)
    expect(timelineSchema.safeParse({ tracks: [] }).success).toBe(true)
  })
})

describe('narrationRanges', () => {
  it('takes the clips on unmuted narration tracks, skipping muted clips and other roles', () => {
    const timeline: Timeline = {
      tracks: [
        track('n1', 'narration', [
          clip('n-a', 1000, 500),
          clip('n-muted', 2000, 500, { muted: true })
        ]),
        track('n2', 'narration', [clip('n-off', 5000, 500)], { muted: true }),
        track('m1', 'music', [clip('music', 0, 10000)])
      ]
    }
    expect(narrationRanges(timeline)).toEqual([{ startMs: 1000, endMs: 1500 }])
  })
})

describe('duckEnvelope and envelopeGainAt', () => {
  const settings = { amountDb: 12, attackMs: 100, releaseMs: 200 }

  it('drops to the amount in dB across a narration span, ramping over attack and release', () => {
    const points = duckEnvelope([{ startMs: 1000, endMs: 3000 }], settings)
    expect(points).toEqual([
      { tMs: 900, gain: 1 },
      { tMs: 1000, gain: duck12 },
      { tMs: 3000, gain: duck12 },
      { tMs: 3200, gain: 1 }
    ])
    expect(envelopeGainAt(points, 500)).toBe(1)
    expect(envelopeGainAt(points, 950)).toBeCloseTo(1 + (duck12 - 1) * 0.5, 10)
    expect(envelopeGainAt(points, 2000)).toBeCloseTo(duck12, 10)
    expect(envelopeGainAt(points, 3100)).toBeCloseTo(duck12 + (1 - duck12) * 0.5, 10)
    expect(envelopeGainAt(points, 3300)).toBe(1)
  })

  it('merges spans closer than attack plus release, so the gain never rises inside the gap', () => {
    const points = duckEnvelope(
      [
        { startMs: 0, endMs: 1000 },
        { startMs: 1100, endMs: 2000 }
      ],
      settings
    )
    expect(points).toEqual([
      { tMs: -100, gain: 1 },
      { tMs: 0, gain: duck12 },
      { tMs: 2000, gain: duck12 },
      { tMs: 2200, gain: 1 }
    ])
  })

  it('keeps spans that are far apart separate', () => {
    const points = duckEnvelope(
      [
        { startMs: 0, endMs: 1000 },
        { startMs: 1600, endMs: 2000 }
      ],
      settings
    )
    expect(points).toHaveLength(8)
    expect(envelopeGainAt(points, 1300)).toBe(1)
    expect(envelopeGainAt(points, 1500)).toBe(1)
  })

  it('applies no ducking with no narration, and none when the amount is 0', () => {
    expect(duckEnvelope([], settings)).toEqual([])
    const none = duckEnvelope([{ startMs: 0, endMs: 1000 }], { ...settings, amountDb: 0 })
    expect(envelopeGainAt(none, 500)).toBe(1)
  })

  it('returns the envelope inside a window, with its ends', () => {
    const points = duckEnvelope([{ startMs: 1000, endMs: 3000 }], settings)
    expect(envelopeWithin(points, 2000, 3100)).toEqual([
      { tMs: 2000, gain: duck12 },
      { tMs: 3000, gain: duck12 },
      { tMs: 3100, gain: envelopeGainAt(points, 3100) }
    ])
    expect(envelopeWithin(points, 500, 500)).toEqual([])
  })
})

describe('gainLinePoints', () => {
  it('maps the envelope into clip-local pixels, full gain near the top', () => {
    const music = clip('music', 1000, 4000)
    const points = duckEnvelope([{ startMs: 2000, endMs: 3000 }], {
      amountDb: 12,
      attackMs: 0,
      releaseMs: 0
    })
    const line = gainLinePoints(music, points, 0.1, 36).split(' ')
    // The clip starts at 1000 ms, so the drop at 2000 ms sits 100 px in.
    expect(line[0]).toBe('0.0,6.0')
    // The drop is a step here (no attack), so the line goes down at x = 100.
    expect(line).toContain(`100.0,${(6 + (1 - duck12) * 24).toFixed(1)}`)
    expect(line.at(-1)).toBe('400.0,6.0')
  })
})
