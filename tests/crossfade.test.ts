import { describe, expect, it } from 'vitest'
import { crossfadeGains } from '@shared/timeline/crossfade'
import { loopLayout } from '@shared/timeline/loopFill'
import type { Clip, Timeline } from '@shared/timeline/timeline'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(id: string, startMs: number, durationMs: number): Clip {
  return { id, mediaId: 'm1', startMs, durationMs, sourceInMs: 0, transform }
}

describe('crossfadeGains', () => {
  const from = clip('a', 0, 1000)
  const to = clip('b', 500, 1000)
  const timeline: Timeline = {
    tracks: [{ id: 't', kind: 'audio', role: 'music', muted: false, clips: [from, to] }],
    transitions: [{ id: 'x', fromClipId: 'a', toClipId: 'b', durationMs: 500 }]
  }

  it('fades the outgoing clip out and the incoming clip in across the overlap', () => {
    const start = crossfadeGains(timeline, 500)
    expect(start.get('b')).toBeCloseTo(0, 10)
    expect(start.get('a')).toBeCloseTo(1, 10)

    const middle = crossfadeGains(timeline, 750)
    expect(middle.get('a')).toBeCloseTo(Math.SQRT1_2, 10)
    expect(middle.get('b')).toBeCloseTo(Math.SQRT1_2, 10)
  })

  it('keeps the level steady: the two powers add to 1 at every point', () => {
    for (const t of [500, 600, 900, 999]) {
      const gains = crossfadeGains(timeline, t)
      expect((gains.get('a') ?? 0) ** 2 + (gains.get('b') ?? 0) ** 2).toBeCloseTo(1, 10)
    }
  })

  it('has no gains outside the overlap or with no transitions', () => {
    expect(crossfadeGains(timeline, 499).size).toBe(0)
    expect(crossfadeGains(timeline, 1000).size).toBe(0)
    expect(crossfadeGains({ tracks: timeline.tracks }, 750).size).toBe(0)
  })

  it('leaves cut transitions to the shared transition fade', () => {
    const cutTimeline: Timeline = {
      tracks: [
        {
          id: 't',
          kind: 'audio',
          role: 'music',
          muted: false,
          clips: [clip('a', 0, 1000), clip('b', 1000, 1000)]
        }
      ],
      transitions: [{ id: 'x', fromClipId: 'a', toClipId: 'b', durationMs: 300 }]
    }
    expect(crossfadeGains(cutTimeline, 1100).size).toBe(0)
  })

  it('crossfades each loop point of a loop-to-fill layout', () => {
    const source = clip('m', 0, 2000)
    let next = 0
    const layout = loopLayout(source, 5000, () => `id${(next += 1)}`)
    const loopTimeline: Timeline = {
      tracks: [
        { id: 't', kind: 'audio', role: 'music', muted: false, clips: [source, ...layout.copies] }
      ],
      transitions: layout.transitions
    }
    const [first] = layout.copies
    const gains = crossfadeGains(loopTimeline, first.startMs)
    expect(gains.get(first.id)).toBeCloseTo(0, 10)
    expect(gains.get('m')).toBeCloseTo(1, 10)
    expect(layout.transitions).toHaveLength(layout.copies.length)
  })
})
