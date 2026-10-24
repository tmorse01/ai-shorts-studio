import { describe, expect, it } from 'vitest'
import { trimReadout } from '@renderer/features/timeline/clipView'
import { trimClip } from '@shared/timeline/edits'
import { snapEdge } from '@shared/timeline/snap'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number, sourceInMs = 0): Clip {
  return { id, startMs, durationMs, sourceInMs, transform: IDENTITY_TRANSFORM }
}

function track(id: string, role: Track['role'], clips: Clip[]): Track {
  return { id, kind: 'video', role, muted: false, clips }
}

// Main: A 0-5s, B 5-10s. The overlay holds O at 2s-6s.
function sample(): Timeline {
  return {
    tracks: [
      track('main', 'main', [clip('A', 0, 5000), clip('B', 5000, 5000, 1000)]),
      track('overlay', 'overlay', [clip('O', 2000, 4000)])
    ]
  }
}

describe('snapEdge', () => {
  it('snaps to the nearest point within the threshold', () => {
    expect(snapEdge(1030, [1000, 1040], 100)).toBe(1040)
    expect(snapEdge(1010, [1000, 1040], 50)).toBe(1000)
  })

  it('leaves the edge alone when no point is close enough', () => {
    expect(snapEdge(1500, [1000], 50)).toBe(1500)
    expect(snapEdge(1500, [], 50)).toBe(1500)
  })
})

describe('trimReadout', () => {
  it('shows the new length and the source time at the start edge', () => {
    expect(trimReadout(clip('B', 5000, 3000, 1000), 'start')).toEqual({
      durationMs: 3000,
      sourceMs: 1000
    })
  })

  it('shows the source time at the end edge', () => {
    expect(trimReadout(clip('B', 5000, 3000, 1000), 'end')).toEqual({
      durationMs: 3000,
      sourceMs: 4000
    })
  })
})

describe('trim edits from a handle drag', () => {
  it('moves the start edge and keeps the end where it was', () => {
    const next = trimClip(sample(), 'B', 'start', 6000)
    const b = next.tracks[0].clips.find((item) => item.id === 'B')!
    expect(b.startMs).toBe(6000)
    expect(b.sourceInMs).toBe(2000)
    expect(b.startMs + b.durationMs).toBe(10000)
  })

  it('stops an end edge at the neighbouring clip on Main', () => {
    const next = trimClip(sample(), 'A', 'end', 9000)
    const a = next.tracks[0].clips.find((item) => item.id === 'A')!
    expect(a.durationMs).toBe(5000)
  })

  it('trims a free layer without stopping at other tracks', () => {
    const next = trimClip(sample(), 'O', 'end', 9000)
    const o = next.tracks[1].clips.find((item) => item.id === 'O')!
    expect(o.durationMs).toBe(7000)
  })
})
