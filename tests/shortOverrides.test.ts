import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project,
  type Short
} from '@shared/project/schema'
import {
  overriddenFields,
  targetReadout,
  effectiveShortSettings
} from '@shared/shorts/shortSettings'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import {
  resetShortOverrideCommand,
  updateShortOverridesCommand
} from '@renderer/features/shorts/shortOverrideCommands'

const NOW = '2026-10-24T09:00:00.000Z'

const short: Short = {
  id: 's1',
  name: 'Short 1',
  createdAt: '2026-10-23T09:00:00.000Z',
  updatedAt: '2026-10-23T09:00:00.000Z',
  status: 'draft',
  order: 0,
  targetLength: { minSec: 30, maxSec: 60 },
  platform: 'generic',
  overrides: {},
  editedSinceExport: false,
  timeline: { tracks: [] }
}

function projectWith(overrides: Partial<Short> = {}): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    mediaTags: [],
    moments: [],
    defaults: { ...DEFAULT_SHORT_DEFAULTS },
    shorts: [{ ...short, ...overrides }],
    scripts: []
  }
}

describe('short override commands', () => {
  it('stores the override on the short and leaves the project defaults alone', () => {
    const history = createHistoryStore(projectWith())
    history
      .getState()
      .execute(
        updateShortOverridesCommand(
          's1',
          { targetLength: { minSec: 15, maxSec: 20 }, platform: 'tiktok' },
          NOW
        )
      )

    const { present } = history.getState()
    expect(present.shorts[0].overrides).toEqual({
      targetLength: { minSec: 15, maxSec: 20 },
      platform: 'tiktok'
    })
    expect(present.defaults).toEqual(DEFAULT_SHORT_DEFAULTS)
    expect(present.shorts[0].updatedAt).toBe(NOW)
  })

  it('rejects an invalid target length before any change is made', () => {
    expect(() =>
      updateShortOverridesCommand('s1', { targetLength: { minSec: 90, maxSec: 10 } }, NOW)
    ).toThrow()
  })

  it('reset removes one override and keeps the others', () => {
    const history = createHistoryStore(
      projectWith({ overrides: { platform: 'reels', safeZones: false } })
    )
    history.getState().execute(resetShortOverrideCommand('s1', 'platform', NOW))

    expect(history.getState().present.shorts[0].overrides).toEqual({ safeZones: false })
  })

  it('flags an exported short as edited when an override changes', () => {
    const exported = projectWith({ status: 'exported', editedSinceExport: false })
    const history = createHistoryStore(exported)
    history.getState().execute(updateShortOverridesCommand('s1', { safeZones: false }, NOW))

    expect(history.getState().present.shorts[0].editedSinceExport).toBe(true)
  })

  it('undoes a reset and brings the override back as one step', () => {
    const history = createHistoryStore(projectWith({ overrides: { safeZones: false } }))
    history.getState().execute(resetShortOverrideCommand('s1', 'safeZones', NOW))
    expect(history.getState().present.shorts[0].overrides).toEqual({})

    history.getState().undo()
    expect(history.getState().present.shorts[0].overrides).toEqual({ safeZones: false })
  })

  it('applies overrides on top of the project defaults', () => {
    const history = createHistoryStore(projectWith())
    history.getState().execute(updateShortOverridesCommand('s1', { safeZones: false }, NOW))
    const { present } = history.getState()

    expect(effectiveShortSettings(present.defaults, present.shorts[0].overrides)).toEqual({
      ...DEFAULT_SHORT_DEFAULTS,
      safeZones: false
    })
  })
})

describe('overriddenFields', () => {
  it('lists only the fields the short overrides, in inspector order', () => {
    expect(overriddenFields({ safeZones: false, targetLength: { minSec: 1, maxSec: 2 } })).toEqual([
      'targetLength',
      'safeZones'
    ])
    expect(overriddenFields({})).toEqual([])
  })
})

describe('targetReadout', () => {
  const target = { minSec: 30, maxSec: 60 }

  it('reports a duration under the target by how much', () => {
    expect(targetReadout(25_000, target)).toEqual({
      tone: 'under',
      text: '25 s, 5 s under the 30–60 s target'
    })
  })

  it('reports a duration over the target by how much', () => {
    expect(targetReadout(62_500, target)).toEqual({
      tone: 'over',
      text: '62.5 s, 2.5 s over the 30–60 s target'
    })
  })

  it('reports a duration inside the target range, including both ends', () => {
    expect(targetReadout(30_000, target).tone).toBe('within')
    expect(targetReadout(60_000, target).tone).toBe('within')
    expect(targetReadout(45_000, target).text).toBe('45 s, within the 30–60 s target')
  })
})
