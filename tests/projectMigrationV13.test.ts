import { describe, expect, it } from 'vitest'
import { migrateV12ToV13, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV12ToV13', () => {
  it('bumps the version and leaves clips without locked or assembly keys', () => {
    const result = migrateV12ToV13({
      schemaVersion: 12,
      shorts: [{ id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }]
    }) as { schemaVersion: number; shorts: unknown[] }
    expect(result.schemaVersion).toBe(13)
    expect(result.shorts).toEqual([
      { id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }
    ])
  })

  it('is registered as the 12 to 13 step, and the current version is at least 13', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 12, to: 13 }))
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(13)
  })
})
