import { describe, expect, it } from 'vitest'
import {
  applyAssemblyPlan,
  assemblyPlanSchema,
  type AssemblyPlan
} from '@shared/assembly/assemblyPlan'
import { TimelineEditError } from '@shared/timeline/edits'
import {
  IDENTITY_TRANSFORM,
  timelineSchema,
  type Clip,
  type Timeline
} from '@shared/timeline/timeline'

function ids(prefix: string): () => string {
  let count = 0
  return () => {
    count += 1
    return `${prefix}_${count}`
  }
}

function cut(sourceId: string, inMs: number, outMs: number, role: 'a' | 'b' = 'a') {
  return { sourceId, inMs, outMs, role, alternatives: [] }
}

const plan: AssemblyPlan = {
  lines: [
    { lineId: 'line_1', cuts: [cut('m1', 0, 2000), cut('m2', 500, 1500, 'b')] },
    {
      lineId: 'line_2',
      cuts: [
        {
          sourceId: 'm3',
          inMs: 1000,
          outMs: 4000,
          role: 'a',
          alternatives: [{ sourceId: 'm4', inMs: 0, outMs: 3000 }]
        }
      ]
    }
  ]
}

function emptyTimeline(): Timeline {
  return {
    tracks: [
      { id: 'main', kind: 'video', role: 'main', muted: false, clips: [] },
      { id: 'music', kind: 'audio', role: 'music', muted: false, clips: [] }
    ]
  }
}

function clipOn(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'media_x',
    startMs,
    durationMs,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    ...extra
  }
}

describe('assemblyPlanSchema', () => {
  it('accepts a plan and rejects a cut whose out point is not after its in point', () => {
    expect(assemblyPlanSchema.safeParse(plan).success).toBe(true)
    const bad = {
      lines: [{ lineId: 'l', cuts: [cut('m1', 2000, 2000)] }]
    }
    expect(assemblyPlanSchema.safeParse(bad).success).toBe(false)
  })
})

describe('timeline clip lock and assembly keys', () => {
  it('parses a clip with locked and assembly, and a clip with neither', () => {
    const parsed = timelineSchema.parse({
      tracks: [
        {
          id: 'main',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            clipOn('a', 0, 1000, {
              locked: true,
              assembly: { lineId: 'line_1', alternatives: [] }
            }),
            clipOn('b', 1000, 1000)
          ]
        }
      ]
    })
    expect(parsed.tracks[0].clips[0].locked).toBe(true)
    expect(parsed.tracks[0].clips[1].assembly).toBeUndefined()
  })
})

describe('applyAssemblyPlan', () => {
  it('appends each cut in plan order with its line and alternatives', () => {
    const next = applyAssemblyPlan(emptyTimeline(), plan, {
      trackId: 'main',
      newId: ids('c')
    })
    const clips = next.tracks[0].clips
    expect(clips.map((clip) => [clip.id, clip.startMs, clip.durationMs, clip.sourceInMs])).toEqual([
      ['c_1', 0, 2000, 0],
      ['c_2', 2000, 1000, 500],
      ['c_3', 3000, 3000, 1000]
    ])
    expect(clips[0].mediaId).toBe('m1')
    expect(clips[2].assembly).toEqual({
      lineId: 'line_2',
      alternatives: [{ sourceId: 'm4', inMs: 0, outMs: 3000 }]
    })
  })

  it('does not mutate the input timeline', () => {
    const before = emptyTimeline()
    const snapshot = JSON.parse(JSON.stringify(before))
    applyAssemblyPlan(before, plan, { trackId: 'main', newId: ids('c') })
    expect(before).toEqual(snapshot)
  })

  it('keeps locked clips and replaces unlocked clips from the same line', () => {
    const start: Timeline = {
      tracks: [
        {
          id: 'main',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            clipOn('old_locked', 0, 500, {
              locked: true,
              assembly: { lineId: 'line_1', alternatives: [] }
            }),
            clipOn('old_free', 500, 500, { assembly: { lineId: 'line_1', alternatives: [] } }),
            clipOn('manual', 1000, 500)
          ]
        }
      ]
    }
    const next = applyAssemblyPlan(start, plan, { trackId: 'main', newId: ids('n') })
    const ids2 = next.tracks[0].clips.map((clip) => clip.id)
    expect(ids2).toEqual(['old_locked', 'manual', 'n_1', 'n_2', 'n_3'])
    const locked = next.tracks[0].clips.find((clip) => clip.id === 'old_locked')
    expect(locked?.startMs).toBe(0)
    expect(next.tracks[0].clips.find((clip) => clip.id === 'manual')?.startMs).toBe(1000)
    expect(next.tracks[0].clips[2].startMs).toBe(1500)
  })

  it('removes linked audio with a replaced clip', () => {
    const start: Timeline = {
      tracks: [
        {
          id: 'main',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            clipOn('v', 0, 1000, {
              linkedAudio: 'a1',
              assembly: { lineId: 'line_1', alternatives: [] }
            })
          ]
        },
        {
          id: 'music',
          kind: 'audio',
          role: 'music',
          muted: false,
          clips: [clipOn('a1', 0, 1000)]
        }
      ]
    }
    const next = applyAssemblyPlan(start, { lines: [] }, { trackId: 'main', newId: ids('n') })
    expect(next.tracks[1].clips.map((clip) => clip.id)).toEqual(['a1'])
    const replaced = applyAssemblyPlan(start, plan, { trackId: 'main', newId: ids('n') })
    expect(replaced.tracks[1].clips).toEqual([])
  })

  it('refuses a locked target track and an unknown track', () => {
    const locked = emptyTimeline()
    locked.tracks[0] = { ...locked.tracks[0], locked: true }
    expect(() => applyAssemblyPlan(locked, plan, { trackId: 'main', newId: ids('c') })).toThrow(
      TimelineEditError
    )
    expect(() =>
      applyAssemblyPlan(emptyTimeline(), plan, { trackId: 'nope', newId: ids('c') })
    ).toThrow(TimelineEditError)
  })

  it('refuses a plan that lists a line twice', () => {
    const dup: AssemblyPlan = { lines: [plan.lines[0], plan.lines[0]] }
    expect(() =>
      applyAssemblyPlan(emptyTimeline(), dup, { trackId: 'main', newId: ids('c') })
    ).toThrow(/more than once/)
  })
})
