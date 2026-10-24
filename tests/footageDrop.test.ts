import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import { clipPayload, momentPayload, rangePayload } from '@shared/timeline/dragPayload'
import { footageClipForDrop, footageInsertMs } from '@shared/timeline/footageDrop'
import type { Track } from '@shared/timeline/timeline'

const media: MediaRef[] = [
  {
    id: 'clip',
    path: 'C:/Footage/clip.mp4',
    pathKind: 'absolute',
    fileName: 'clip.mp4',
    sizeBytes: 100,
    durationMs: 12_000,
    kind: 'video'
  },
  {
    id: 'song',
    path: 'C:/Music/song.mp3',
    pathKind: 'absolute',
    fileName: 'song.mp3',
    sizeBytes: 100,
    durationMs: 90_000,
    kind: 'audio'
  }
]

const identity = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function mainTrack(): Track {
  return {
    id: 'main',
    kind: 'video',
    role: 'main',
    muted: false,
    clips: [
      {
        id: 'a',
        mediaId: 'clip',
        startMs: 0,
        durationMs: 4_000,
        sourceInMs: 0,
        transform: identity
      },
      {
        id: 'b',
        mediaId: 'clip',
        startMs: 4_000,
        durationMs: 2_000,
        sourceInMs: 0,
        transform: identity
      }
    ]
  }
}

function overlayTrack(): Track {
  return { id: 'ov', kind: 'video', role: 'overlay', muted: false, clips: [] }
}

describe('footageInsertMs', () => {
  it('keeps the time on a free layer, even where a clip is', () => {
    expect(footageInsertMs(overlayTrack(), 1_234.6)).toBe(1_235)
  })

  it('snaps a point inside a main clip to the nearer edge', () => {
    expect(footageInsertMs(mainTrack(), 1_000)).toBe(0)
    expect(footageInsertMs(mainTrack(), 3_000)).toBe(4_000)
  })

  it('clamps a negative time to zero', () => {
    expect(footageInsertMs(mainTrack(), -50)).toBe(0)
  })
})

describe('footageClipForDrop', () => {
  it('turns a range drop on Main into a clip with the payload in and out', () => {
    const result = footageClipForDrop(
      rangePayload('clip', 1_500, 3_500),
      media,
      mainTrack(),
      'n',
      9_000
    )
    expect(result).toEqual({
      ok: true,
      startMs: 9_000,
      clip: {
        id: 'n',
        mediaId: 'clip',
        startMs: 9_000,
        durationMs: 2_000,
        sourceInMs: 1_500,
        transform: identity
      }
    })
  })

  it('keeps the moment id on a moment drop', () => {
    const payload = momentPayload({ id: 'm1', mediaId: 'clip', inMs: 0, outMs: 5_000 })
    const result = footageClipForDrop(payload, media, overlayTrack(), 'n', 0)
    expect(result.ok && result.clip.momentId).toBe('m1')
  })

  it('does not add a moment id to a clip or range drop', () => {
    const result = footageClipForDrop(clipPayload('clip', 12_000), media, overlayTrack(), 'n', 0)
    expect(result.ok && 'momentId' in result.clip).toBe(false)
  })

  it('refuses audio footage on a video track', () => {
    const result = footageClipForDrop(clipPayload('song', 90_000), media, mainTrack(), 'n', 0)
    expect(result.ok).toBe(false)
  })

  it('refuses footage that is no longer in the project', () => {
    const result = footageClipForDrop(clipPayload('gone', 1_000), media, mainTrack(), 'n', 0)
    expect(result.ok).toBe(false)
  })

  it('refuses a drop on a track that is not a video track', () => {
    const music: Track = { id: 'm', kind: 'audio', role: 'music', muted: false, clips: [] }
    const result = footageClipForDrop(clipPayload('clip', 12_000), media, music, 'n', 0)
    expect(result.ok).toBe(false)
  })
})
