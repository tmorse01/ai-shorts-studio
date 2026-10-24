import { describe, expect, it } from 'vitest'
import { migrateV10ToV11, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV10ToV11', () => {
  it('bumps the version and leaves clips without fade keys', () => {
    const result = migrateV10ToV11({
      schemaVersion: 10,
      shorts: [{ id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }]
    }) as { schemaVersion: number; shorts: unknown[] }
    expect(result.schemaVersion).toBe(11)
    expect(result.shorts).toEqual([
      { id: 's1', timeline: { tracks: [{ id: 't1', clips: [{ id: 'c1' }] }] } }
    ])
  })

  it('is registered as the 10 to 11 step, and the current version is 11', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 10, to: 11 }))
    expect(CURRENT_SCHEMA_VERSION).toBe(11)
  })
})
