import { describe, expect, it } from 'vitest'
import { migrateV7ToV8, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

describe('migrateV7ToV8', () => {
  it('bumps the version and leaves the rest of the project alone', () => {
    const result = migrateV7ToV8({
      schemaVersion: 7,
      moments: [{ id: 'mo1' }],
      shorts: [{ id: 's1', timeline: { tracks: [] } }]
    }) as { schemaVersion: number; moments: unknown[]; shorts: unknown[] }
    expect(result.schemaVersion).toBe(8)
    expect(result.moments).toEqual([{ id: 'mo1' }])
    expect(result.shorts).toEqual([{ id: 's1', timeline: { tracks: [] } }])
  })

  it('is registered as the 7 to 8 step, and the current version is at least 8', () => {
    expect(projectMigrations).toContainEqual(expect.objectContaining({ from: 7, to: 8 }))
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(8)
  })

  it('rejects a file that is not an object', () => {
    expect(() => migrateV7ToV8([])).toThrow('the file is not a JSON object')
  })
})
