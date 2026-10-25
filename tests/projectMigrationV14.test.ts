import { describe, expect, it } from 'vitest'
import { migrateV13ToV14, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV13ToV14', () => {
  it('bumps the version and leaves clips without locked or assembly keys', () => {
    const result = migrateV13ToV14({
      schemaVersion: 13,
      shorts: [{ id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }]
    }) as { schemaVersion: number; shorts: unknown[] }
    expect(result.schemaVersion).toBe(14)
    expect(result.shorts).toEqual([
      { id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }
    ])
  })

  it('is registered as the 13 to 14 step, and the current version is at least 14', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 13, to: 14 }))
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(14)
  })
})
