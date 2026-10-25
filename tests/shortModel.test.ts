import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, DEFAULT_SHORT_DEFAULTS, shortSchema } from '@shared/project/schema'
import { migrateV2ToV3, projectMigrations } from '@shared/project/migrations'
import { loadProject } from '@shared/project/loadProject'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'

// A project as the second cut wrote it: shorts had no order, settings or edit flags.
function sampleV2Project() {
  return {
    schemaVersion: 2,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:30:00.000Z',
    media: [],
    shorts: [
      {
        id: 'short_a',
        name: 'Intro hook',
        createdAt: '2026-10-23T09:10:00.000Z',
        updatedAt: '2026-10-23T09:20:00.000Z',
        status: 'exported',
        timeline: { tracks: [] }
      },
      {
        id: 'short_b',
        name: 'Closing line',
        createdAt: '2026-10-23T09:11:00.000Z',
        updatedAt: '2026-10-23T09:21:00.000Z',
        status: 'draft',
        timeline: { tracks: [] }
      }
    ],
    scripts: []
  }
}

describe('short model: schema', () => {
  it('bumps the schema version and registers each migration in order', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(19)
    expect(projectMigrations.map((m) => [m.from, m.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 15],
      [15, 16],
      [16, 17],
      [17, 18],
      [18, 19]
    ])
  })

  it('rejects a target length whose minimum is above its maximum', () => {
    const result = shortSchema.safeParse({
      id: 'short_1',
      name: 'Too long',
      createdAt: '2026-10-23T09:10:00.000Z',
      updatedAt: '2026-10-23T09:10:00.000Z',
      status: 'draft',
      order: 0,
      targetLength: { minSec: 60, maxSec: 30 },
      platform: 'tiktok',
      overrides: {},
      editedSinceExport: false,
      timeline: { tracks: [] }
    })
    expect(result.success).toBe(false)
  })

  it('accepts partial overrides and rejects an unknown platform', () => {
    const base = {
      id: 'short_1',
      name: 'Hook',
      createdAt: '2026-10-23T09:10:00.000Z',
      updatedAt: '2026-10-23T09:10:00.000Z',
      status: 'ready',
      order: 0,
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'reels',
      editedSinceExport: false,
      timeline: { tracks: [] }
    }
    expect(shortSchema.safeParse({ ...base, overrides: { safeZones: false } }).success).toBe(true)
    expect(shortSchema.safeParse({ ...base, overrides: {}, platform: 'myspace' }).success).toBe(
      false
    )
  })
})

describe('short model: v2 to v3 migration', () => {
  it('gives every short the default settings, its list position and no overrides', () => {
    const result = loadProject(sampleV2Project())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { project, migrated, fromVersion, toVersion } = result.value
    expect(migrated).toBe(true)
    expect(fromVersion).toBe(2)
    expect(toVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.defaults).toEqual(DEFAULT_SHORT_DEFAULTS)
    expect(project.shorts.map((short) => short.order)).toEqual([0, 1])
    expect(project.shorts[0]).toMatchObject({
      id: 'short_a',
      status: 'exported',
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      overrides: {},
      editedSinceExport: false
    })
  })

  it('adds the defaults to a project with no shorts list and bumps the version', () => {
    const result = migrateV2ToV3({ ...sampleV2Project(), shorts: undefined })
    expect(result).toMatchObject({ schemaVersion: 3, defaults: DEFAULT_SHORT_DEFAULTS })
  })

  it('reports a short that is not an object', () => {
    expect(() => migrateV2ToV3({ ...sampleV2Project(), shorts: ['nope'] })).toThrow(
      'short 1 is not an object'
    )
  })
})

describe('effective short settings', () => {
  const defaults = {
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'youtube' as const,
    safeZones: true
  }

  it('uses the project defaults when a short has no overrides', () => {
    expect(effectiveShortSettings(defaults, {})).toEqual(defaults)
  })

  it('applies each override on top of the defaults', () => {
    const effective = effectiveShortSettings(defaults, {
      platform: 'tiktok',
      safeZones: false
    })
    expect(effective).toEqual({
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'tiktok',
      safeZones: false
    })
  })

  it('does not share the target length object with the defaults', () => {
    const effective = effectiveShortSettings(defaults, {})
    effective.targetLength.maxSec = 90
    expect(defaults.targetLength.maxSec).toBe(60)
  })
})
