import { describe, expect, it } from 'vitest'
import { clipAudioSources } from '@renderer/features/audio/audioMix'
import { DEFAULT_DUCKING, duckEnvelope, envelopeGainAt } from '@shared/timeline/ducking'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }
// The gain the default ducking gives at 2500 ms, with narration from 2000 to 3000 ms.
const duck = envelopeGainAt(duckEnvelope([{ startMs: 2000, endMs: 3000 }], DEFAULT_DUCKING), 2500)

function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return { id, mediaId: 'm1', startMs, durationMs, sourceInMs: 0, transform, ...extra }
}

function track(id: string, role: Track['role'], clips: Clip[]): Track {
  return { id, kind: 'audio', role, muted: false, clips }
}

function gainsAt(timeline: Timeline, tMs: number): Record<string, number> {
  return Object.fromEntries(
    clipAudioSources(timeline, tMs).map((source) => [source.key, source.gain])
  )
}

describe('preview mix gains', () => {
  it('ducks music under narration and leaves the narration at full gain', () => {
    const timeline: Timeline = {
      tracks: [
        track('music', 'music', [clip('bed', 0, 10000)]),
        track('narration', 'narration', [clip('voice', 2000, 1000)])
      ]
    }
    expect(gainsAt(timeline, 500).bed).toBe(1)
    expect(gainsAt(timeline, 2500).bed).toBeCloseTo(duck, 10)
    expect(gainsAt(timeline, 2500).voice).toBe(1)
  })

  it('fades loop copies in a crossfade and multiplies the clip gain', () => {
    const timeline: Timeline = {
      tracks: [track('music', 'music', [clip('a', 0, 1000, { gain: 0.5 }), clip('b', 500, 1000)])],
      transitions: [{ id: 'x', fromClipId: 'a', toClipId: 'b', durationMs: 500 }]
    }
    const gains = gainsAt(timeline, 750)
    expect(gains.a).toBeCloseTo(0.5 * Math.SQRT1_2, 10)
    expect(gains.b).toBeCloseTo(Math.SQRT1_2, 10)
  })
})
