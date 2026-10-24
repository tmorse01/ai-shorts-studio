import { describe, expect, it } from 'vitest'
import { migrateV9ToV10, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV9ToV10', () => {
  it('bumps the version and leaves the rest of the project alone', () => {
    const result = migrateV9ToV10({
      schemaVersion: 9,
      shorts: [{ id: 's1', timeline: { tracks: [] } }]
    }) as { schemaVersion: number; shorts: unknown[] }
    expect(result.schemaVersion).toBe(10)
    expect(result.shorts).toEqual([{ id: 's1', timeline: { tracks: [] } }])
  })

  it('is registered as the 9 to 10 step, and the current version is at least 10', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 9, to: 10 }))
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(10)
  })
})
