import { describe, expect, it } from 'vitest'
import { placeClips, TimelineEditError } from '@shared/timeline/edits'
import { snapPoints, snapStart } from '@shared/timeline/snap'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number): Clip {
  return { id, startMs, durationMs, sourceInMs: 0, transform: IDENTITY_TRANSFORM }
}

function track(
  id: string,
  role: Track['role'],
  clips: Clip[],
  kind: Track['kind'] = 'video',
  locked = false
): Track {
  return { id, kind, role, muted: false, locked, clips }
}

// Main: A 0-5s, B 5-10s, C 15-20s (a gap sits at 10-15s). Overlay video is a free layer.
function sample(): Timeline {
  return {
    tracks: [
      track('main', 'main', [clip('A', 0, 5000), clip('B', 5000, 5000), clip('C', 15000, 5000)]),
      track('overlay', 'overlay', [clip('O', 2000, 3000)]),
      track('music', 'music', [clip('M', 0, 30000)], 'audio')
    ]
  }
}

function starts(timeline: Timeline, trackId: string): Record<string, number> {
  const found = timeline.tracks.find((item) => item.id === trackId)
  return Object.fromEntries((found?.clips ?? []).map((item) => [item.id, item.startMs]))
}

describe('placeClips on the main track', () => {
  it('reorders a clip forward and ripples the clips after the insert point', () => {
    // Drop A at 10s (after B). B moves to 5s-10s, the gap at 10-15s is closed by C shifting.
    const next = placeClips(sample(), ['A'], 'main', 10000)
    expect(starts(next, 'main')).toEqual({ B: 5000, A: 10000, C: 20000 })
  })

  it('inserts a clip before another and shifts the clips after it', () => {
    const next = placeClips(sample(), ['C'], 'main', 5000)
    expect(starts(next, 'main')).toEqual({ A: 0, C: 5000, B: 10000 })
  })

  it('leaves the gap the moved clip left and shifts later clips', () => {
    // Move B away to the start; nothing else moves more than the ripple requires.
    const next = placeClips(sample(), ['B'], 'main', 0)
    expect(starts(next, 'main')).toEqual({ B: 0, A: 5000, C: 20000 })
  })

  it('moves a selection as one block and keeps the spacing inside it', () => {
    // A and B are 0-10s with no gap. Moved to 20s they land at 20s and 25s, so C follows.
    const next = placeClips(sample(), ['A', 'B'], 'main', 20000)
    const main = next.tracks.find((item) => item.id === 'main')!
    expect(starts(next, 'main')).toEqual({ C: 15000, A: 20000, B: 25000 })
    expect(main.clips.every((item) => item.startMs >= 0)).toBe(true)
  })

  it('snaps an insert point that falls inside a clip to the nearer edge', () => {
    // 7s is inside B (5-10s), nearer to its start, so the clip lands at 5s and B ripples right.
    const next = placeClips(sample(), ['C'], 'main', 7000)
    expect(starts(next, 'main')).toEqual({ A: 0, C: 5000, B: 10000 })
  })

  it('leaves the main track with no overlaps', () => {
    const next = placeClips(sample(), ['O'], 'main', 1000)
    expect(() => placeClips(next, ['A'], 'main', 2000)).not.toThrow()
    const main = next.tracks.find((item) => item.id === 'main')!
    const sorted = [...main.clips].sort((a, b) => a.startMs - b.startMs)
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].startMs).toBeGreaterThanOrEqual(
        sorted[index - 1].startMs + sorted[index - 1].durationMs
      )
    }
  })
})

describe('placeClips on free layers and across tracks', () => {
  it('moves a free-layer clip to a new start and lets it overlap', () => {
    const next = placeClips(sample(), ['O'], 'overlay', 8000)
    expect(starts(next, 'overlay')).toEqual({ O: 8000 })
    expect(starts(next, 'main')).toEqual({ A: 0, B: 5000, C: 15000 })
  })

  it('moves a main clip onto the overlay track and leaves a gap on main', () => {
    const next = placeClips(sample(), ['B'], 'overlay', 12000)
    expect(starts(next, 'main')).toEqual({ A: 0, C: 15000 })
    expect(starts(next, 'overlay')).toEqual({ O: 2000, B: 12000 })
  })

  it('moves an overlay clip onto main and ripples the clips after it', () => {
    const next = placeClips(sample(), ['O'], 'main', 5000)
    expect(starts(next, 'main')).toEqual({ A: 0, O: 5000, B: 8000, C: 18000 })
    expect(starts(next, 'overlay')).toEqual({})
  })

  it('refuses a move to a track of another kind', () => {
    expect(() => placeClips(sample(), ['O'], 'music', 0)).toThrow(TimelineEditError)
  })

  it('refuses a move from or to a locked track', () => {
    const locked = sample()
    locked.tracks[1] = { ...locked.tracks[1], locked: true }
    expect(() => placeClips(locked, ['O'], 'main', 0)).toThrow(TimelineEditError)
    expect(() => placeClips(locked, ['A'], 'overlay', 0)).toThrow(TimelineEditError)
  })

  it('returns the timeline unchanged for an empty selection', () => {
    expect(placeClips(sample(), [], 'main', 0)).toEqual(sample())
  })
})

describe('snapStart', () => {
  it('snaps the start to a point within the threshold', () => {
    expect(snapStart(1040, 2000, [1000, 9000], 50)).toEqual({ startMs: 1000, snappedMs: 1000 })
  })

  it('snaps the end of the block, moving the start so the end lands on the point', () => {
    expect(snapStart(6980, 2000, [9000], 50)).toEqual({ startMs: 7000, snappedMs: 9000 })
  })

  it('takes the nearest point when two are in range', () => {
    expect(snapStart(1030, 500, [1000, 1040], 100).snappedMs).toBe(1040)
  })

  it('leaves the start alone when no point is close', () => {
    expect(snapStart(1500, 500, [1000], 50)).toEqual({ startMs: 1500, snappedMs: null })
  })

  it('never snaps below zero', () => {
    expect(snapStart(10, 2000, [0], 50).startMs).toBe(0)
  })
})

describe('snapPoints', () => {
  it('uses zero, the playhead and the edges of clips that are not moving', () => {
    // C is the only clip with edges at 15000 and 20000, so excluding it removes exactly those.
    const points = snapPoints(sample(), ['C'], 4200)
    expect(points).toContain(0)
    expect(points).toContain(4200)
    expect(points).toContain(10000)
    expect(points).not.toContain(15000)
    expect(points).not.toContain(20000)
  })
})
