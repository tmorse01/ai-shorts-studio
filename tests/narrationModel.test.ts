import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'
import { migrateV19ToV20, projectMigrations } from '@shared/project/migrations'
import { narrationSchema } from '@shared/timeline/narration'
import { IDENTITY_TRANSFORM, clipSchema } from '@shared/timeline/timeline'

const baseClip = {
  id: 'n1',
  mediaId: 'vo',
  startMs: 0,
  durationMs: 2000,
  sourceInMs: 0,
  transform: IDENTITY_TRANSFORM
}

describe('narration model', () => {
  it('accepts each source, with the optional fields left out', () => {
    for (const source of ['recorded', 'imported', 'tts'] as const) {
      expect(narrationSchema.safeParse({ source }).success).toBe(true)
    }
  })

  it('accepts a line link, voice and text when given', () => {
    const result = narrationSchema.safeParse({
      scriptLineId: 'line_1',
      source: 'tts',
      voiceId: 'narrator-a',
      text: 'Hello there.'
    })
    expect(result.success).toBe(true)
  })

  it('refuses an unknown source and an empty line id', () => {
    expect(narrationSchema.safeParse({ source: 'sung' }).success).toBe(false)
    expect(narrationSchema.safeParse({ scriptLineId: '  ', source: 'recorded' }).success).toBe(
      false
    )
  })

  it('lets a clip carry narration, and a clip without it stays valid', () => {
    expect(clipSchema.safeParse({ ...baseClip, narration: { source: 'recorded' } }).success).toBe(
      true
    )
    expect(clipSchema.parse(baseClip).narration).toBeUndefined()
  })

  it('refuses a clip whose narration is malformed', () => {
    expect(clipSchema.safeParse({ ...baseClip, narration: { source: 'bogus' } }).success).toBe(
      false
    )
  })
})

describe('schema 19 to 20 migration', () => {
  it('bumps the schema version to 20 and registers the 19 to 20 migration', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(20)
    expect(migrateV19ToV20({ schemaVersion: 19, id: 'p1' })).toEqual({
      schemaVersion: 20,
      id: 'p1'
    })
    expect(projectMigrations.find((m) => m.to === 20)).toMatchObject({ from: 19, to: 20 })
  })

  it('rejects a project that is not an object', () => {
    expect(() => migrateV19ToV20('nope')).toThrow(/not a JSON object/)
  })
})
