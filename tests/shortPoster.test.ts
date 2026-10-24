import { describe, expect, it } from 'vitest'
import { posterFileName, posterTarget } from '@shared/shorts/poster'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'

function clip(id: string, mediaId: string, startMs: number, durationMs: number, sourceInMs = 0) {
  return { id, mediaId, startMs, durationMs, sourceInMs, transform: IDENTITY_TRANSFORM }
}

const EMPTY: Timeline = { tracks: [] }

describe('posterTarget', () => {
  it('is null for a timeline with no video clip, so the card shows its placeholder', () => {
    expect(posterTarget(EMPTY, undefined)).toBeNull()
    const audioOnly: Timeline = {
      tracks: [
        {
          id: 'a1',
          kind: 'audio',
          role: 'narration',
          muted: false,
          clips: [clip('c1', 'm1', 0, 1000)]
        }
      ]
    }
    expect(posterTarget(audioOnly, undefined)).toBeNull()
  })

  it('defaults to the first frame of the timeline when no poster time is set', () => {
    const timeline: Timeline = {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [clip('c1', 'm1', 0, 5000, 2000)]
        }
      ]
    }
    expect(posterTarget(timeline, undefined)).toEqual({
      clipId: 'c1',
      mediaId: 'm1',
      sourceTimeMs: 2000
    })
  })

  it('maps the poster time through the clip into source time', () => {
    const timeline: Timeline = {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [clip('c1', 'm1', 0, 4000, 1000), clip('c2', 'm2', 4000, 4000, 500)]
        }
      ]
    }
    expect(posterTarget(timeline, 5000)).toEqual({
      clipId: 'c2',
      mediaId: 'm2',
      sourceTimeMs: 1500
    })
  })

  it('uses the topmost video clip covering the time', () => {
    const timeline: Timeline = {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [clip('base', 'm1', 0, 4000)]
        },
        {
          id: 'v2',
          kind: 'video',
          role: 'overlay',
          muted: false,
          clips: [clip('top', 'm2', 1000, 2000, 300)]
        }
      ]
    }
    expect(posterTarget(timeline, 1500)).toEqual({
      clipId: 'top',
      mediaId: 'm2',
      sourceTimeMs: 800
    })
  })

  it('falls back to the first frame of the earliest video clip when nothing covers the time', () => {
    const timeline: Timeline = {
      tracks: [
        {
          id: 'v1',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [clip('late', 'm2', 9000, 1000, 40)]
        }
      ]
    }
    expect(posterTarget(timeline, 0)).toEqual({ clipId: 'late', mediaId: 'm2', sourceTimeMs: 40 })
  })
})

describe('posterFileName', () => {
  it('is stable for the same footage frame and changes when the frame changes', () => {
    const frame = { mediaId: 'm1', sourceTimeMs: 2000 }
    expect(posterFileName(frame)).toBe('m1-2000.jpg')
    expect(posterFileName({ ...frame, sourceTimeMs: 2500 })).not.toBe(posterFileName(frame))
  })
})
