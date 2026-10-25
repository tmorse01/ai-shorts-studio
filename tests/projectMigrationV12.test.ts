import { describe, expect, it } from 'vitest'
import { migrateV11ToV12, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV11ToV12', () => {
  it('bumps the version and leaves tracks without a captions key', () => {
    const result = migrateV11ToV12({
      schemaVersion: 11,
      shorts: [{ id: 's1', timeline: { tracks: [{ id: 't1', clips: [] }] } }]
    }) as { schemaVersion: number; shorts: unknown[] }
    expect(result.schemaVersion).toBe(12)
    expect(result.shorts).toEqual([{ id: 's1', timeline: { tracks: [{ id: 't1', clips: [] }] } }])
  })

  it('is registered as the 11 to 12 step, and the current version is 13', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 11, to: 12 }))
    expect(CURRENT_SCHEMA_VERSION).toBe(14)
  })
})
