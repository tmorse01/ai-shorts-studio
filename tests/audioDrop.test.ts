import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import { clipPayload, momentPayload, rangePayload } from '@shared/timeline/dragPayload'
import { audioClipForDrop } from '@shared/timeline/audioDrop'

const media: MediaRef[] = [
  {
    id: 'song',
    path: 'C:/Music/song.mp3',
    pathKind: 'absolute',
    fileName: 'song.mp3',
    sizeBytes: 100,
    durationMs: 90_000,
    kind: 'audio'
  },
  {
    id: 'clip',
    path: 'C:/Footage/clip.mp4',
    pathKind: 'absolute',
    fileName: 'clip.mp4',
    sizeBytes: 100,
    durationMs: 12_000,
    kind: 'video'
  }
]

describe('audioClipForDrop', () => {
  it('places a whole audio file as an audio clip at the drop point', () => {
    const result = audioClipForDrop(clipPayload('song', 90_000), media, 'c1', 4_321.6)
    expect(result).toEqual({
      ok: true,
      clip: {
        id: 'c1',
        mediaId: 'song',
        startMs: 4322,
        durationMs: 90_000,
        sourceInMs: 0,
        transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }
      }
    })
  })

  it('keeps the marked range of an audio file as its source window', () => {
    const result = audioClipForDrop(rangePayload('song', 2_000, 7_000), media, 'c2', 0)
    expect(result).toMatchObject({
      ok: true,
      clip: { durationMs: 5_000, sourceInMs: 2_000, startMs: 0 }
    })
  })

  it('refuses video footage', () => {
    const result = audioClipForDrop(clipPayload('clip', 12_000), media, 'c3', 0)
    expect(result).toEqual({ ok: false, reason: 'Only audio files can go on the Music lane.' })
  })

  it('refuses a moment for now', () => {
    const payload = momentPayload({ id: 'mo1', mediaId: 'song', inMs: 0, outMs: 1_000 })
    expect(audioClipForDrop(payload, media, 'c4', 0).ok).toBe(false)
  })

  it('refuses media the project no longer holds', () => {
    const result = audioClipForDrop(clipPayload('gone', 1_000), media, 'c5', 0)
    expect(result.ok).toBe(false)
  })
})
