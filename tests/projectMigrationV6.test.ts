import { describe, expect, it } from 'vitest'
import { migrateV5ToV6 } from '@shared/project/migrations'

describe('migrateV5ToV6', () => {
  it('adds an empty custom tag list and leaves media untagged', () => {
    const result = migrateV5ToV6({
      schemaVersion: 5,
      media: [{ id: 'm1', fileName: 'a.mp4' }]
    }) as { schemaVersion: number; mediaTags: unknown[]; media: unknown[] }
    expect(result.schemaVersion).toBe(6)
    expect(result.mediaTags).toEqual([])
    expect(result.media).toEqual([{ id: 'm1', fileName: 'a.mp4' }])
  })

  it('rejects a file that is not an object', () => {
    expect(() => migrateV5ToV6([])).toThrow('the file is not a JSON object')
  })
})
