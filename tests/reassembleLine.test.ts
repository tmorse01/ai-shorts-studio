import { describe, expect, it } from 'vitest'
import {
  applyAssemblyPlan,
  clipIdsReplacedBy,
  type AssemblyPlan
} from '@shared/assembly/assemblyPlan'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '@shared/timeline/timeline'

// Re-assembling one line (Epic 15, #142) replaces only that line's unlocked clips. These tests cover the
// pure part: which clip ids a single-line plan replaces, and the timeline that results.

function clipOn(id: string, startMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'media_x',
    startMs,
    durationMs: 500,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

function assembled(lineId: string, extra: Partial<Clip> = {}): Partial<Clip> {
  return { assembly: { lineId, alternatives: [] }, ...extra }
}

function mainTrack(clips: Clip[]): Track {
  return { id: 'main', kind: 'video', role: 'main', muted: false, clips }
}

const onePlan: AssemblyPlan = {
  lines: [
    {
      lineId: 'line_2',
      cuts: [{ sourceId: 'new_media', inMs: 0, outMs: 1000, role: 'a', alternatives: [] }]
    }
  ]
}

describe('clipIdsReplacedBy', () => {
  it('returns the unlocked clips placed for the line, and no others', () => {
    const track = mainTrack([
      clipOn('line2_free', 0, assembled('line_2')),
      clipOn('line2_locked', 500, assembled('line_2', { locked: true })),
      clipOn('line1_free', 1000, assembled('line_1')),
      clipOn('manual', 1500)
    ])
    expect([...clipIdsReplacedBy(track, new Set(['line_2']))]).toEqual(['line2_free'])
  })

  it('includes the linked audio of a replaced clip', () => {
    const track = mainTrack([clipOn('v1', 0, assembled('line_2', { linkedAudio: 'a1' }))])
    expect([...clipIdsReplacedBy(track, new Set(['line_2']))].sort()).toEqual(['a1', 'v1'])
  })

  it('is empty when the line has no clips on the track', () => {
    const track = mainTrack([clipOn('line1', 0, assembled('line_1'))])
    expect(clipIdsReplacedBy(track, new Set(['line_2'])).size).toBe(0)
  })
})

describe('re-assembling one line through applyAssemblyPlan', () => {
  it('replaces only the line unlocked clips and leaves locked clips and other lines alone', () => {
    const timeline: Timeline = {
      tracks: [
        mainTrack([
          clipOn('line1', 0, assembled('line_1')),
          clipOn('line2_old', 500, assembled('line_2')),
          clipOn('line2_locked', 1000, assembled('line_2', { locked: true })),
          clipOn('manual', 1500)
        ])
      ]
    }
    const next = applyAssemblyPlan(timeline, onePlan, { trackId: 'main', newId: () => 'line2_new' })
    const clips = next.tracks[0].clips
    expect(clips.map((clip) => clip.id)).toEqual(['line1', 'line2_locked', 'manual', 'line2_new'])
    expect(clips.find((clip) => clip.id === 'line2_locked')?.startMs).toBe(1000)
    expect(clips.find((clip) => clip.id === 'line1')?.startMs).toBe(0)
  })

  it('does not change the input timeline', () => {
    const timeline: Timeline = {
      tracks: [mainTrack([clipOn('line2_old', 0, assembled('line_2'))])]
    }
    applyAssemblyPlan(timeline, onePlan, { trackId: 'main', newId: () => 'n' })
    expect(timeline.tracks[0].clips.map((clip) => clip.id)).toEqual(['line2_old'])
  })
})
