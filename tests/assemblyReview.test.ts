import { describe, expect, it } from 'vitest'
import type { AssemblyPlan } from '../src/shared/assembly/assemblyPlan'
import {
  acceptedPlan,
  attachedShort,
  buildMatchRequest,
  shotsByMediaOf,
  videoTrackId
} from '../src/renderer/features/assembly/assemblyReview'
import type { Project, Script, Short } from '../src/shared/project/schema'

const script: Script = {
  id: 's1',
  title: 'Boats',
  topic: 'Harbour',
  lines: [
    { id: 'L1', text: 'Boats at dawn' },
    { id: 'L2', text: '   ' },
    { id: 'L3', text: 'Nets come in' }
  ]
}

const project = {
  media: [
    { id: 'm1', fileName: 'dock.mp4', durationMs: 60000 },
    { id: 'm2', fileName: 'pier.mp4' }
  ],
  shorts: []
} as unknown as Project

describe('buildMatchRequest', () => {
  it('sends only lines with text, with names and durations by media id', () => {
    const request = buildMatchRequest({
      script,
      project,
      docs: [],
      shotsByMedia: { m1: [{ startSec: 0, endSec: 4 }] }
    })

    expect(request.lines).toEqual([
      { lineId: 'L1', text: 'Boats at dawn' },
      { lineId: 'L3', text: 'Nets come in' }
    ])
    expect(request.targetMs).toBeNull()
    expect(request.mediaNames).toEqual({ m1: 'dock.mp4', m2: 'pier.mp4' })
    expect(request.durationsMs).toEqual({ m1: 60000 })
    expect(request.shots).toEqual({ m1: [{ startSec: 0, endSec: 4 }] })
  })
})

describe('acceptedPlan', () => {
  const plan: AssemblyPlan = {
    lines: [
      { lineId: 'L1', cuts: [] },
      { lineId: 'L3', cuts: [] }
    ]
  }

  it('keeps only the accepted lines, in plan order', () => {
    expect(acceptedPlan(plan, new Set(['L3', 'L1'])).lines.map((line) => line.lineId)).toEqual([
      'L1',
      'L3'
    ])
    expect(acceptedPlan(plan, new Set(['L3'])).lines.map((line) => line.lineId)).toEqual(['L3'])
  })

  it('returns an empty plan when nothing is accepted', () => {
    expect(acceptedPlan(plan, new Set())).toEqual({ lines: [] })
  })
})

describe('shotsByMediaOf', () => {
  it('keeps only the items that have shot ranges', () => {
    const shots = shotsByMediaOf({
      autoAnalyze: true,
      records: {
        m1: { shots: [{ startSec: 0, endSec: 3 }] },
        m2: {}
      }
    } as never)

    expect(shots).toEqual({ m1: [{ startSec: 0, endSec: 3 }] })
    expect(shotsByMediaOf(undefined)).toEqual({})
  })
})

describe('attachedShort and videoTrackId', () => {
  const short = {
    id: 'sh1',
    scriptId: 's1',
    timeline: {
      tracks: [
        { id: 'a1', kind: 'audio', clips: [] },
        { id: 'v1', kind: 'video', locked: true, clips: [] },
        { id: 'v2', kind: 'video', clips: [] }
      ]
    }
  } as unknown as Short

  it('finds the short attached to the script', () => {
    expect(attachedShort({ shorts: [short] } as unknown as Project, 's1')?.id).toBe('sh1')
    expect(attachedShort({ shorts: [short] } as unknown as Project, 's9')).toBeUndefined()
  })

  it('picks the first unlocked video track', () => {
    expect(videoTrackId(short)).toBe('v2')
  })
})
