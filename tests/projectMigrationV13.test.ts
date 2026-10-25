import { describe, expect, it } from 'vitest'
import { migrateV13ToV14 } from '@shared/project/migrations'

describe('schema 13 to 14 migration', () => {
  it('only moves the version, since caption presets are optional', () => {
    const v13 = { schemaVersion: 13, id: 'p1', shorts: [] }
    expect(migrateV13ToV14(v13)).toEqual({ schemaVersion: 14, id: 'p1', shorts: [] })
  })

  it('rejects a project that is not an object', () => {
    expect(() => migrateV13ToV14('nope')).toThrow(/not a JSON object/)
  })
})
