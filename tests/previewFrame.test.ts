import { describe, expect, it } from 'vitest'
import type { Timeline } from '@shared/timeline/timeline'
import {
  needsSeek,
  planPreloads,
  topVideoLayer,
  topVideoLayerAt
} from '../src/renderer/features/preview/previewFrame'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(id: string, startMs: number, durationMs: number, mediaId = 'm1', sourceInMs = 0) {
  return { id, mediaId, startMs, durationMs, sourceInMs, transform }
}

const timeline: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [clip('a', 0, 1000, 'm1', 0), clip('b', 1000, 1000, 'm2', 5000)]
    },
    {
      id: 'overlay',
      kind: 'video',
      role: 'overlay',
      muted: false,
      clips: [clip('o', 1500, 500, 'm3', 200)]
    }
  ]
}

describe('planPreloads', () => {
  it('cues the clip that starts at the next boundary', () => {
    expect(planPreloads(timeline, 0, 1)).toEqual([{ mediaId: 'm2', startMs: 1000, sourceMs: 5000 }])
  })

  it('cues the clips starting at each of the next boundaries, in order', () => {
    expect(planPreloads(timeline, 0, 2)).toEqual([
      { mediaId: 'm2', startMs: 1000, sourceMs: 5000 },
      { mediaId: 'm3', startMs: 1500, sourceMs: 200 }
    ])
  })

  it('skips muted tracks, non-video tracks and text clips', () => {
    const muted: Timeline = {
      tracks: [{ ...timeline.tracks[0], muted: true, clips: [clip('b', 1000, 1000, 'm2')] }]
    }
    expect(planPreloads(muted, 0, 2)).toEqual([])
    const text: Timeline = {
      tracks: [{ ...timeline.tracks[0], kind: 'text', clips: [clip('t', 1000, 1000, 'm2')] }]
    }
    expect(planPreloads(text, 0, 2)).toEqual([])
  })

  it('stops when no boundary is left', () => {
    expect(planPreloads(timeline, 5000, 3)).toEqual([])
  })
})

describe('topVideoLayer', () => {
  it('shows the topmost video layer at the playhead', () => {
    expect(topVideoLayerAt(timeline, 1600)?.mediaId).toBe('m3')
    expect(topVideoLayerAt(timeline, 1200)?.mediaId).toBe('m2')
    expect(topVideoLayerAt(timeline, 9000)).toBeNull()
  })

  it('ignores layers with no footage', () => {
    const layers = [
      {
        trackId: 'a',
        trackKind: 'video' as const,
        clipId: 'x',
        mediaId: 'm1',
        sourceTimeMs: 0,
        transform
      },
      {
        trackId: 'b',
        trackKind: 'text' as const,
        clipId: 'y',
        sourceTimeMs: 0,
        transform
      }
    ]
    expect(topVideoLayer(layers)?.clipId).toBe('x')
  })
})

describe('needsSeek', () => {
  it('seeks by a frame when paused and by a few tenths of a second when playing', () => {
    expect(needsSeek(1, 1.005, false)).toBe(false)
    expect(needsSeek(1, 1.1, false)).toBe(true)
    expect(needsSeek(1, 1.2, true)).toBe(false)
    expect(needsSeek(1, 1.5, true)).toBe(true)
  })
})
