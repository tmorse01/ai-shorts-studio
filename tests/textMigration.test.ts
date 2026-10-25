import { describe, expect, it } from 'vitest'
import { migrateV12ToV13, projectMigrations } from '@shared/project/migrations'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

interface MigratedClip {
  text?: string
  textItem?: unknown
}

function migratedClips(result: unknown): MigratedClip[] {
  const data = result as { shorts: { timeline: { tracks: { clips: MigratedClip[] }[] } }[] }
  return data.shorts[0].timeline.tracks[0].clips
}

describe('schema 13 text migration', () => {
  it('gives a text clip with words a caption textItem and keeps the label', () => {
    const data = {
      schemaVersion: 12,
      shorts: [
        {
          id: 'short-1',
          timeline: {
            tracks: [
              {
                id: 't',
                kind: 'text',
                role: 'text',
                muted: false,
                clips: [
                  {
                    id: 'c1',
                    startMs: 0,
                    durationMs: 1000,
                    sourceInMs: 0,
                    transform,
                    text: 'Hello'
                  },
                  {
                    id: 'c2',
                    startMs: 1000,
                    durationMs: 1000,
                    sourceInMs: 0,
                    transform,
                    text: '  '
                  }
                ]
              }
            ]
          }
        }
      ]
    }
    const result = migrateV12ToV13(data) as { schemaVersion: number }
    expect(result.schemaVersion).toBe(13)
    const [first, second] = migratedClips(result)
    expect(first.text).toBe('Hello')
    expect(first.textItem).toEqual({ text: 'Hello', styleId: 'caption', x: 0.5, y: 0.85, scale: 1 })
    expect(second.textItem).toBeUndefined()
  })

  it('leaves clips on other tracks alone', () => {
    const clip = { id: 'c1', startMs: 0, durationMs: 1000, sourceInMs: 0, transform, text: 'x' }
    const data = {
      schemaVersion: 12,
      shorts: [
        {
          id: 'short-1',
          timeline: {
            tracks: [{ id: 'v', kind: 'video', role: 'main', muted: false, clips: [clip] }]
          }
        }
      ]
    }
    expect(migratedClips(migrateV12ToV13(data))[0]).toEqual(clip)
  })

  it('is registered after the schema 12 step', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(19)
    expect(projectMigrations.some((m) => m.from === 12 && m.to === 13)).toBe(true)
  })
})
