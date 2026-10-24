import { describe, expect, it } from 'vitest'
import { migrateV6ToV7 } from '@shared/project/migrations'
import { momentSchema } from '@shared/project/schema'

describe('migrateV6ToV7', () => {
  it('adds an empty moment list and leaves the rest of the project alone', () => {
    const result = migrateV6ToV7({
      schemaVersion: 6,
      mediaTags: [{ id: 't1', name: 'Hook' }],
      media: [{ id: 'm1', fileName: 'a.mp4' }]
    }) as { schemaVersion: number; moments: unknown[]; mediaTags: unknown[]; media: unknown[] }
    expect(result.schemaVersion).toBe(7)
    expect(result.moments).toEqual([])
    expect(result.mediaTags).toEqual([{ id: 't1', name: 'Hook' }])
    expect(result.media).toEqual([{ id: 'm1', fileName: 'a.mp4' }])
  })

  it('rejects a file that is not an object', () => {
    expect(() => migrateV6ToV7([])).toThrow('the file is not a JSON object')
  })
})

describe('momentSchema', () => {
  const moment = {
    id: 'mo1',
    mediaId: 'm1',
    name: 'Berm drop',
    inMs: 1000,
    outMs: 6000,
    tags: [],
    createdBy: 'user'
  }

  it('accepts a moment whose Out is after its In', () => {
    expect(momentSchema.safeParse(moment).success).toBe(true)
  })

  it('rejects a moment whose range is empty or reversed', () => {
    expect(momentSchema.safeParse({ ...moment, outMs: 1000 }).success).toBe(false)
    expect(momentSchema.safeParse({ ...moment, outMs: 500 }).success).toBe(false)
  })

  it('accepts only user or ai as the creator', () => {
    expect(momentSchema.safeParse({ ...moment, createdBy: 'bot' }).success).toBe(false)
    expect(momentSchema.safeParse({ ...moment, createdBy: 'ai' }).success).toBe(true)
  })
})
