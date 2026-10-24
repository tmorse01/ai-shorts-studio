import { describe, expect, it } from 'vitest'
import { migrateV4ToV5 } from '@shared/project/migrations'

function shortWithTracks(tracks: unknown[]) {
  return { id: 's1', timeline: { tracks } }
}

describe('migrateV4ToV5', () => {
  it('gives each track a role from its kind, with the first video track as main', () => {
    const result = migrateV4ToV5({
      schemaVersion: 4,
      shorts: [
        shortWithTracks([
          { id: 'v1', kind: 'video', muted: false, clips: [] },
          { id: 'v2', kind: 'video', muted: false, clips: [] },
          { id: 'a1', kind: 'audio', muted: false, clips: [] },
          { id: 't1', kind: 'text', muted: false, clips: [] },
          { id: 'o1', kind: 'overlay', muted: false, clips: [] }
        ])
      ]
    }) as {
      schemaVersion: number
      shorts: { timeline: { tracks: { id: string; role: string }[] } }[]
    }
    expect(result.schemaVersion).toBe(5)
    expect(result.shorts[0].timeline.tracks.map((track) => [track.id, track.role])).toEqual([
      ['v1', 'main'],
      ['v2', 'overlay'],
      ['a1', 'music'],
      ['t1', 'text'],
      ['o1', 'overlay']
    ])
  })

  it('keeps a role a track already has', () => {
    const result = migrateV4ToV5({
      schemaVersion: 4,
      shorts: [
        shortWithTracks([{ id: 'n', kind: 'audio', role: 'narration', muted: false, clips: [] }])
      ]
    }) as { shorts: { timeline: { tracks: { role: string }[] } }[] }
    expect(result.shorts[0].timeline.tracks[0].role).toBe('narration')
  })
})
