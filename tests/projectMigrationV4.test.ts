import { describe, expect, it } from 'vitest'
import { migrateV3ToV4 } from '@shared/project/migrations'

function shortWithTimeline(timeline: unknown) {
  return {
    id: 'short_1',
    name: 'Intro hook',
    createdAt: '2026-10-23T09:10:00.000Z',
    updatedAt: '2026-10-23T09:20:00.000Z',
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'youtube',
    overrides: {},
    editedSinceExport: false,
    timeline
  }
}

describe('migrateV3ToV4', () => {
  it('replaces the empty placeholder timeline with an empty timeline and bumps the version', () => {
    const result = migrateV3ToV4({ schemaVersion: 3, shorts: [shortWithTimeline({})] }) as {
      schemaVersion: number
      shorts: { timeline: unknown }[]
    }
    expect(result.schemaVersion).toBe(4)
    expect(result.shorts[0].timeline).toEqual({ tracks: [] })
  })

  it('keeps a timeline that already matches the schema', () => {
    const timeline = { tracks: [{ id: 't', kind: 'text', role: 'text', muted: false, clips: [] }] }
    const result = migrateV3ToV4({ schemaVersion: 3, shorts: [shortWithTimeline(timeline)] }) as {
      shorts: { timeline: unknown }[]
    }
    expect(result.shorts[0].timeline).toEqual(timeline)
  })

  it('rejects a short that is not an object', () => {
    expect(() => migrateV3ToV4({ schemaVersion: 3, shorts: [42] })).toThrow(
      'short 1 is not an object'
    )
  })
})
