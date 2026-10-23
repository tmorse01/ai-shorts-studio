import { describe, expect, it } from 'vitest'
import { pickMusicTrack } from '../src/main/music'

const tracks = ['C:\\Music\\a.wav', 'C:\\Music\\b.mp3', 'C:\\Music\\c.m4a']

describe('music track choice', () => {
  it('picks the same track for the same short every time', () => {
    const first = pickMusicTrack(tracks, 'short-1')
    expect(first).not.toBeNull()
    expect(pickMusicTrack(tracks, 'short-1')).toBe(first)
    expect(tracks).toContain(first)
  })

  it('spreads different shorts across the library', () => {
    const picked = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => pickMusicTrack(tracks, id)))
    expect(picked.size).toBeGreaterThan(1)
  })

  it('returns null with no tracks', () => {
    expect(pickMusicTrack([], 'short-1')).toBeNull()
  })
})
