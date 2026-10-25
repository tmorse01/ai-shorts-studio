import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Moment, type Project } from '@shared/project/schema'
import type { GeneratedShort } from '@shared/shorts/shortPlan'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import { createGeneratedShortCommand } from '@renderer/features/shorts/generatedShortsCommands'

function projectWith(moments: Moment[] = []): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    media: [
      {
        id: 'm1',
        path: 'G:\\Footage\\a.mp4',
        pathKind: 'absolute',
        fileName: 'a.mp4',
        sizeBytes: 1,
        kind: 'video'
      }
    ],
    mediaTags: [],
    moments,
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      safeZones: true
    },
    shorts: [],
    scripts: []
  }
}

const dawn: GeneratedShort = {
  title: 'Dawn run',
  hook: 'Boats leave the harbour',
  moments: [
    { mediaId: 'm1', name: 'Launch', inMs: 0, outMs: 5000, note: 'Strong open' },
    { mediaId: 'm1', name: 'Wake', inMs: 12000, outMs: 18000 }
  ]
}

function makeIds(prefix: string) {
  let n = 0
  return () => `${prefix}${++n}`
}

function apply(project: Project, short: GeneratedShort, ids = makeIds('x')): Project {
  const command = createGeneratedShortCommand({
    shortId: 'short_1',
    trackId: 'track_main',
    short,
    now: '2026-10-25T00:00:00.000Z',
    newId: ids
  })
  return produce(project, (draft) => command.produce(draft))
}

describe('create a generated short', () => {
  it('makes a draft batch-draft short whose Main track holds the moments in order', () => {
    const next = apply(projectWith(), dawn)
    const short = next.shorts[0]
    expect(next.shorts).toHaveLength(1)
    expect(short).toMatchObject({
      id: 'short_1',
      name: 'Dawn run',
      status: 'draft',
      batchDraft: true,
      editedSinceExport: false
    })
    const track = short?.timeline.tracks[0]
    expect(track).toMatchObject({ id: 'track_main', role: 'main', kind: 'video' })
    expect(track?.clips.map((clip) => [clip.startMs, clip.durationMs, clip.sourceInMs])).toEqual([
      [0, 5000, 0],
      [5000, 6000, 12000]
    ])
  })

  it('saves each new moment as an AI moment and links the clips to it', () => {
    const next = apply(projectWith(), dawn)
    expect(next.moments).toEqual([
      {
        id: 'x1',
        mediaId: 'm1',
        name: 'Launch',
        inMs: 0,
        outMs: 5000,
        tags: [],
        createdBy: 'ai',
        note: 'Strong open'
      },
      {
        id: 'x3',
        mediaId: 'm1',
        name: 'Wake',
        inMs: 12000,
        outMs: 18000,
        tags: [],
        createdBy: 'ai'
      }
    ])
    const clips = next.shorts[0]?.timeline.tracks[0]?.clips ?? []
    expect(clips.map((clip) => clip.momentId)).toEqual(['x1', 'x3'])
  })

  it('reuses a moment the project already has with the same source and range', () => {
    const existing: Moment = {
      id: 'user1',
      mediaId: 'm1',
      name: 'My launch',
      inMs: 0,
      outMs: 5000,
      tags: [],
      createdBy: 'user'
    }
    const next = apply(projectWith([existing]), dawn)
    expect(next.moments.filter((item) => item.inMs === 0 && item.outMs === 5000)).toEqual([
      existing
    ])
    expect(next.shorts[0]?.timeline.tracks[0]?.clips[0]?.momentId).toBe('user1')
    expect(next.moments).toHaveLength(2)
  })

  it('refuses a short whose source is no longer in the project', () => {
    const gone: GeneratedShort = {
      title: 'Gone',
      hook: '',
      moments: [{ mediaId: 'gone', name: 'x', inMs: 0, outMs: 4000 }]
    }
    expect(() => apply(projectWith(), gone)).toThrow('no longer in the project')
  })

  it('is one undo step, and undo removes the short and the moments it created', () => {
    const history = createHistoryStore(projectWith())
    const command = createGeneratedShortCommand({
      shortId: 'short_1',
      trackId: 'track_main',
      short: dawn,
      now: '2026-10-25T00:00:00.000Z',
      newId: makeIds('h')
    })
    history.getState().execute(command)
    expect(history.getState().present.shorts).toHaveLength(1)
    expect(history.getState().present.moments).toHaveLength(2)

    history.getState().undo()
    expect(history.getState().present.shorts).toEqual([])
    expect(history.getState().present.moments).toEqual([])
  })
})
