import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project,
  type Short
} from '@shared/project/schema'
import { createHistoryStore, type HistoryApi } from '@renderer/features/history/historyStore'
import { IDENTITY_TRANSFORM } from '@shared/timeline/timeline'

const SAMPLE_TIMELINE = {
  tracks: [
    {
      id: 'v1',
      kind: 'video' as const,
      muted: false,
      clips: [
        { id: 'c1', startMs: 0, durationMs: 1000, sourceInMs: 0, transform: IDENTITY_TRANSFORM }
      ]
    }
  ]
}
import {
  createShortCommand,
  deleteShortCommand,
  duplicateShortCommand,
  nextShortName,
  renameShortCommand,
  reorderShortCommand,
  setShortStatusCommand
} from '@renderer/features/shorts/shortCommands'

const NOW = '2026-10-23T10:00:00.000Z'

function short(id: string, name: string, status: Short['status'], order: number): Short {
  return {
    id,
    name,
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    status,
    order,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'youtube',
    overrides: {},
    editedSinceExport: false,
    timeline: SAMPLE_TIMELINE
  }
}

function projectWith(shorts: Short[]): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    defaults: { ...DEFAULT_SHORT_DEFAULTS, targetLength: { minSec: 20, maxSec: 45 } },
    shorts,
    scripts: []
  }
}

function historyWith(shorts: Short[]): HistoryApi<Project> {
  return createHistoryStore(projectWith(shorts))
}

function ids(history: HistoryApi<Project>): string[] {
  return history.getState().present.shorts.map((s) => s.id)
}

function orders(history: HistoryApi<Project>): number[] {
  return history.getState().present.shorts.map((s) => s.order)
}

const threeShorts = () => [
  short('s1', 'Short 1', 'draft', 0),
  short('s2', 'Short 2', 'ready', 1),
  short('s3', 'Short 3', 'exported', 2)
]

describe('nextShortName', () => {
  it('starts at Short 1 for an empty project', () => {
    expect(nextShortName([])).toBe('Short 1')
  })

  it('goes one past the highest existing number, so a deleted name is not reused', () => {
    expect(nextShortName([{ name: 'Short 1' }, { name: 'Short 3' }])).toBe('Short 4')
  })

  it('ignores names that are not in the Short N form', () => {
    expect(nextShortName([{ name: 'Intro hook' }, { name: 'Short 2 cut' }])).toBe('Short 1')
  })
})

describe('create short', () => {
  it('appends a draft short with the project defaults, then undo removes it', () => {
    const history = historyWith(threeShorts())
    expect(history.getState().execute(createShortCommand('s4', NOW))).toBe(true)

    const created = history.getState().present.shorts[3]
    expect(created).toMatchObject({
      id: 's4',
      name: 'Short 4',
      status: 'draft',
      order: 3,
      targetLength: { minSec: 20, maxSec: 45 },
      platform: 'generic',
      overrides: {},
      editedSinceExport: false
    })

    history.getState().undo()
    expect(ids(history)).toEqual(['s1', 's2', 's3'])
  })
})

describe('rename short', () => {
  it('renames and undo restores the old name', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(renameShortCommand('s1', '  Intro hook ', NOW))
    expect(history.getState().present.shorts[0].name).toBe('Intro hook')
    expect(history.getState().present.shorts[0].updatedAt).toBe(NOW)

    history.getState().undo()
    expect(history.getState().present.shorts[0].name).toBe('Short 1')
  })

  it('refuses a blank name and records nothing', () => {
    const history = historyWith(threeShorts())
    expect(() => history.getState().execute(renameShortCommand('s1', '   ', NOW))).toThrow(
      'A short needs a name.'
    )
    expect(history.getState().past).toHaveLength(0)
  })

  it('flags an Exported short as edited since export', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(renameShortCommand('s3', 'Final cut', NOW))
    expect(history.getState().present.shorts[2].editedSinceExport).toBe(true)
  })

  it('does not flag a Draft or Ready short', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(renameShortCommand('s2', 'Ready cut', NOW))
    expect(history.getState().present.shorts[1].editedSinceExport).toBe(false)
  })
})

describe('duplicate short', () => {
  it('copies the short as "<name> copy" with a new id, right after the original', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(duplicateShortCommand('s1', 'c1', NOW))

    expect(ids(history)).toEqual(['s1', 'c1', 's2', 's3'])
    expect(orders(history)).toEqual([0, 1, 2, 3])
    expect(history.getState().present.shorts[1]).toMatchObject({
      name: 'Short 1 copy',
      createdAt: NOW,
      updatedAt: NOW,
      status: 'draft'
    })
    expect(history.getState().present.shorts[1].timeline).toEqual(SAMPLE_TIMELINE)
  })

  it('makes a deep copy, so editing the copy leaves the original alone', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(duplicateShortCommand('s1', 'c1', NOW))
    history.getState().execute({
      label: 'Touch copy timeline',
      produce: (draft) => {
        draft.shorts[1].timeline.tracks[0].clips.push({
          ...SAMPLE_TIMELINE.tracks[0].clips[0],
          id: 'c2'
        })
      }
    })
    expect(history.getState().present.shorts[0].timeline).toEqual(SAMPLE_TIMELINE)
  })

  it('turns an Exported original into a Draft copy with no export date', () => {
    const exported = {
      ...short('s3', 'Short 3', 'exported', 2),
      exportedAt: NOW,
      editedSinceExport: true
    }
    const history = historyWith([...threeShorts().slice(0, 2), exported])
    history.getState().execute(duplicateShortCommand('s3', 'c3', NOW))

    const copy = history.getState().present.shorts[3]
    expect(copy).toMatchObject({ status: 'draft', editedSinceExport: false })
    expect(copy).not.toHaveProperty('exportedAt')
  })

  it('undo removes the copy', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(duplicateShortCommand('s1', 'c1', NOW))
    history.getState().undo()
    expect(ids(history)).toEqual(['s1', 's2', 's3'])
    expect(orders(history)).toEqual([0, 1, 2])
  })
})

describe('reorder short', () => {
  it('moves a short to a new position and renumbers the list', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(reorderShortCommand('s3', 0))
    expect(ids(history)).toEqual(['s3', 's1', 's2'])
    expect(orders(history)).toEqual([0, 1, 2])
  })

  it('clamps an out-of-range target to the end of the list', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(reorderShortCommand('s1', 99))
    expect(ids(history)).toEqual(['s2', 's3', 's1'])
  })

  it('undo puts the short back where it was', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(reorderShortCommand('s1', 2))
    history.getState().undo()
    expect(ids(history)).toEqual(['s1', 's2', 's3'])
    expect(orders(history)).toEqual([0, 1, 2])
  })
})

describe('set short status', () => {
  it('moves a Draft short to Ready and undo restores Draft', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(setShortStatusCommand('s1', 'ready', NOW))
    expect(history.getState().present.shorts[0].status).toBe('ready')
    history.getState().undo()
    expect(history.getState().present.shorts[0].status).toBe('draft')
  })

  it('refuses to change an Exported short by hand', () => {
    const history = historyWith(threeShorts())
    expect(() => history.getState().execute(setShortStatusCommand('s3', 'draft', NOW))).toThrow(
      'An exported short keeps its status until it is exported again.'
    )
    expect(history.getState().present.shorts[2].status).toBe('exported')
  })
})

describe('delete short', () => {
  it('removes the short, renumbers the rest, and undo brings it back in place', () => {
    const history = historyWith(threeShorts())
    history.getState().execute(deleteShortCommand('s2'))
    expect(ids(history)).toEqual(['s1', 's3'])
    expect(orders(history)).toEqual([0, 1])

    history.getState().undo()
    expect(ids(history)).toEqual(['s1', 's2', 's3'])
    expect(orders(history)).toEqual([0, 1, 2])
    expect(history.getState().present.shorts[1]).toEqual(threeShorts()[1])
  })
})

describe('shorts commands on an unknown id', () => {
  it('throws and records nothing', () => {
    const history = historyWith(threeShorts())
    expect(() => history.getState().execute(deleteShortCommand('missing'))).toThrow(
      'No short with id missing'
    )
    expect(history.getState().past).toHaveLength(0)
  })
})
