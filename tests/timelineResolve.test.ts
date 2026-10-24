import { describe, expect, it } from 'vitest'
import {
  clipsAt,
  nextClipBoundary,
  resolveFrame,
  timelineDurationMs
} from '@shared/timeline/resolveFrame'
import { IDENTITY_TRANSFORM, timelineSchema, type Timeline } from '@shared/timeline/timeline'

function clip(id: string, startMs: number, durationMs: number, sourceInMs = 0) {
  return {
    id,
    mediaId: 'media_1',
    startMs,
    durationMs,
    sourceInMs,
    transform: IDENTITY_TRANSFORM
  }
}

const timeline: Timeline = {
  tracks: [
    {
      id: 'v1',
      kind: 'video',
      muted: false,
      clips: [clip('a', 0, 1000, 5000), clip('b', 2000, 1000)]
    },
    { id: 'o1', kind: 'overlay', muted: false, clips: [clip('c', 500, 1000)] },
    { id: 'm1', kind: 'audio', muted: true, clips: [clip('d', 0, 3000)] }
  ]
}

describe('timeline schema', () => {
  it('accepts an empty timeline and a fully specified track', () => {
    expect(timelineSchema.parse({ tracks: [] })).toEqual({ tracks: [] })
    expect(timelineSchema.safeParse(timeline).success).toBe(true)
  })

  it('rejects a track with no muted flag or a clip with no transform', () => {
    const noMuted = { tracks: [{ id: 't', kind: 'video', clips: [] }] }
    const noTransform = {
      tracks: [
        {
          id: 't',
          kind: 'video',
          muted: false,
          clips: [{ ...clip('k', 0, 10), transform: undefined }]
        }
      ]
    }
    expect(timelineSchema.safeParse(noMuted).success).toBe(false)
    expect(timelineSchema.safeParse(noTransform).success).toBe(false)
  })

  it('rejects an unknown track kind and a zero-length clip', () => {
    expect(
      timelineSchema.safeParse({ tracks: [{ id: 't', kind: 'music', clips: [] }] }).success
    ).toBe(false)
    expect(
      timelineSchema.safeParse({
        tracks: [{ id: 't', kind: 'video', clips: [clip('k', 0, 0)] }]
      }).success
    ).toBe(false)
  })
})

describe('clipsAt', () => {
  it('returns nothing in a gap between clips', () => {
    const solo: Timeline = {
      tracks: [
        { id: 'v', kind: 'video', muted: false, clips: [clip('a', 0, 100), clip('b', 300, 100)] }
      ]
    }
    expect(clipsAt(solo, 150)).toEqual([])
  })

  it('treats the start as inside and the end as outside a clip', () => {
    const solo: Timeline = {
      tracks: [{ id: 'v', kind: 'video', muted: false, clips: [clip('a', 100, 100)] }]
    }
    expect(clipsAt(solo, 100).map((c) => c.clip.id)).toEqual(['a'])
    expect(clipsAt(solo, 199).map((c) => c.clip.id)).toEqual(['a'])
    expect(clipsAt(solo, 200)).toEqual([])
  })
})

describe('resolveFrame', () => {
  it('returns overlapping clips across tracks in track order, bottom to top', () => {
    const layers = resolveFrame(timeline, 600)
    expect(layers.map((layer) => layer.clipId)).toEqual(['a', 'c'])
    expect(layers.map((layer) => layer.trackId)).toEqual(['v1', 'o1'])
  })

  it('maps timeline time to source time using sourceInMs', () => {
    const [layer] = resolveFrame(timeline, 250)
    expect(layer.clipId).toBe('a')
    expect(layer.sourceTimeMs).toBe(5000 + 250)
  })

  it('leaves out muted tracks', () => {
    const layers = resolveFrame(timeline, 1000)
    expect(layers.map((layer) => layer.clipId)).toEqual(['c'])
    expect(layers.some((layer) => layer.trackId === 'm1')).toBe(false)
  })

  it('returns nothing after the end of the timeline', () => {
    expect(resolveFrame(timeline, timelineDurationMs(timeline))).toEqual([])
  })
})

describe('timeline helpers', () => {
  it('finds the duration from the last clip end on any track, or 0 when empty', () => {
    expect(timelineDurationMs(timeline)).toBe(3000)
    expect(timelineDurationMs({ tracks: [] })).toBe(0)
  })

  it('finds the next clip start or end after a time, or null at the end', () => {
    expect(nextClipBoundary(timeline, 0)).toBe(500)
    expect(nextClipBoundary(timeline, 1000)).toBe(1500)
    expect(nextClipBoundary(timeline, 3000)).toBeNull()
  })
})
