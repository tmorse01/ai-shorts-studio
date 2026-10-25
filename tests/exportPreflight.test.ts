import { describe, expect, it } from 'vitest'
import {
  canContinueExport,
  preflightShort,
  preflightShorts,
  type PreflightShort
} from '../src/shared/export/exportPreflight'
import type { Timeline } from '../src/shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }
const TARGET = { minSec: 30, maxSec: 60 }

// One clip per [mediaId, durationMs] pair, laid end to end on the main track.
function timelineOf(clips: [string, number][]): Timeline {
  let start = 0
  return {
    tracks: [
      {
        id: 'main',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: clips.map(([mediaId, durationMs], index) => {
          const clip = {
            id: `c${index}`,
            mediaId,
            startMs: start,
            durationMs,
            sourceInMs: 0,
            transform: IDENTITY
          }
          start += durationMs
          return clip
        })
      }
    ]
  }
}

function short(timeline: Timeline, targetLength = TARGET): PreflightShort {
  return { id: 's1', name: 'Hook', timeline, targetLength }
}

describe('preflightShort', () => {
  it('reports nothing for a short with footage online and within target', () => {
    expect(preflightShort(short(timelineOf([['m1', 45_000]])), new Set())).toEqual([])
  })

  it('reports an empty short as blocking', () => {
    const issues = preflightShort(short(timelineOf([])), new Set())
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'empty', blocking: true })
  })

  it('reports offline footage with the number of clips that use it', () => {
    const timeline = timelineOf([
      ['m1', 10_000],
      ['gone', 10_000],
      ['gone', 10_000]
    ])
    const issues = preflightShort(short(timeline), new Set(['gone']))
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'offline', blocking: false, shortName: 'Hook' })
    ])
    expect(issues[0]?.message).toContain('2 clips')
  })

  it('reports a short longer than its target, but not blocking', () => {
    const issues = preflightShort(short(timelineOf([['m1', 75_000]])), new Set())
    expect(issues).toEqual([expect.objectContaining({ kind: 'overTarget', blocking: false })])
    expect(issues[0]?.message).toContain('75.0 s')
    expect(issues[0]?.message).toContain('60 s target')
  })

  it('does not report a short exactly at its maximum', () => {
    expect(preflightShort(short(timelineOf([['m1', 60_000]])), new Set())).toEqual([])
  })

  it('can report offline footage and an over-target short together', () => {
    const issues = preflightShort(short(timelineOf([['gone', 90_000]])), new Set(['gone']))
    expect(issues.map((issue) => issue.kind)).toEqual(['offline', 'overTarget'])
  })
})

describe('preflightShorts and canContinueExport', () => {
  it('checks each short in order', () => {
    const issues = preflightShorts(
      [
        { ...short(timelineOf([['m1', 10_000]])), id: 'a', name: 'A' },
        { ...short(timelineOf([['m2', 90_000]])), id: 'b', name: 'B' }
      ],
      new Set()
    )
    expect(issues.map((issue) => issue.shortId)).toEqual(['b'])
  })

  it('allows continuing past warnings only', () => {
    const warnings = preflightShort(short(timelineOf([['m1', 90_000]])), new Set())
    expect(canContinueExport(warnings)).toBe(true)
    expect(canContinueExport([])).toBe(true)
  })

  it('blocks continuing when any issue is blocking', () => {
    const blocked = preflightShort(short(timelineOf([])), new Set())
    expect(canContinueExport(blocked)).toBe(false)
  })
})
