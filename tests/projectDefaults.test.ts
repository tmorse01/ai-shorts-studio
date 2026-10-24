import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project,
  type Short
} from '@shared/project/schema'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import {
  updateProjectDefaultsCommand,
  validateTargetLength
} from '@renderer/features/shorts/projectDefaultsCommands'

const short: Short = {
  id: 's1',
  name: 'Short 1',
  createdAt: '2026-10-23T09:00:00.000Z',
  updatedAt: '2026-10-23T09:00:00.000Z',
  status: 'draft',
  order: 0,
  targetLength: { minSec: 20, maxSec: 45 },
  platform: 'tiktok',
  overrides: { safeZones: false },
  editedSinceExport: false,
  timeline: {}
}

function projectWithShort(): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    defaults: { ...DEFAULT_SHORT_DEFAULTS },
    shorts: [short],
    scripts: []
  }
}

describe('project defaults command', () => {
  it('changes only the project defaults, not existing shorts', () => {
    const history = createHistoryStore(projectWithShort())
    history.getState().execute(
      updateProjectDefaultsCommand({
        targetLength: { minSec: 15, maxSec: 30 },
        platform: 'reels',
        safeZones: false
      })
    )

    const { present } = history.getState()
    expect(present.defaults).toEqual({
      targetLength: { minSec: 15, maxSec: 30 },
      platform: 'reels',
      safeZones: false
    })
    expect(present.shorts[0]).toEqual(short)
  })

  it('keeps fields left out of the change', () => {
    const history = createHistoryStore(projectWithShort())
    history.getState().execute(updateProjectDefaultsCommand({ platform: 'youtube' }))

    expect(history.getState().present.defaults).toEqual({
      ...DEFAULT_SHORT_DEFAULTS,
      platform: 'youtube'
    })
  })

  it('undoes and redoes the change as one step', () => {
    const history = createHistoryStore(projectWithShort())
    history.getState().execute(updateProjectDefaultsCommand({ safeZones: false }))

    history.getState().undo()
    expect(history.getState().present.defaults.safeZones).toBe(true)

    history.getState().redo()
    expect(history.getState().present.defaults.safeZones).toBe(false)
  })

  it('refuses a target length where min is greater than max and leaves the project alone', () => {
    const history = createHistoryStore(projectWithShort())
    const before = history.getState().present

    expect(() =>
      history
        .getState()
        .execute(updateProjectDefaultsCommand({ targetLength: { minSec: 60, maxSec: 30 } }))
    ).toThrow()
    expect(history.getState().present).toBe(before)
    expect(history.getState().past).toHaveLength(0)
  })
})

describe('validateTargetLength', () => {
  it('accepts min less than or equal to max', () => {
    expect(validateTargetLength(30, 60)).toBeNull()
    expect(validateTargetLength(45, 45)).toBeNull()
  })

  it('reports min greater than max', () => {
    expect(validateTargetLength(61, 60)).toBe('minSec must not be greater than maxSec')
  })

  it('rejects zero and negative lengths', () => {
    expect(validateTargetLength(0, 60)).not.toBeNull()
    expect(validateTargetLength(30, -1)).not.toBeNull()
  })
})
