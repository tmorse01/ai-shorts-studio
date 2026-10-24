import { describe, expect, it } from 'vitest'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  describeFrame,
  hasClips,
  placeTransform
} from '@shared/compositor/frame'
import type { Timeline } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function timeline(): Timeline {
  return {
    tracks: [
      {
        id: 'v1',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [
          {
            id: 'a',
            mediaId: 'm1',
            startMs: 0,
            durationMs: 1000,
            sourceInMs: 500,
            transform: IDENTITY
          }
        ]
      },
      {
        id: 'v2',
        kind: 'video',
        role: 'overlay',
        muted: false,
        clips: [
          {
            id: 'b',
            mediaId: 'm2',
            startMs: 0,
            durationMs: 2000,
            sourceInMs: 0,
            transform: { x: 10, y: -20, scale: 0.5, rotationDeg: 90 }
          }
        ]
      }
    ]
  }
}

describe('placeTransform', () => {
  it('fills the canvas when the source size is unknown', () => {
    expect(placeTransform(IDENTITY, null)).toEqual({
      centerX: CANVAS_WIDTH / 2,
      centerY: CANVAS_HEIGHT / 2,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      rotationDeg: 0
    })
  })

  it('fits a 16:9 source inside the 9:16 canvas, keeping its aspect ratio', () => {
    const placement = placeTransform(IDENTITY, { width: 1920, height: 1080 })
    expect(placement.width).toBeCloseTo(CANVAS_WIDTH)
    expect(placement.height).toBeCloseTo((1080 * CANVAS_WIDTH) / 1920)
    expect(placement.width / placement.height).toBeCloseTo(1920 / 1080)
  })

  it('applies scale about the centre, then the offset and rotation', () => {
    const placement = placeTransform(
      { x: 10, y: -20, scale: 0.5, rotationDeg: 90 },
      { width: 1080, height: 1920 }
    )
    expect(placement.width).toBeCloseTo(CANVAS_WIDTH * 0.5)
    expect(placement.height).toBeCloseTo(CANVAS_HEIGHT * 0.5)
    expect(placement.centerX).toBe(CANVAS_WIDTH / 2 + 10)
    expect(placement.centerY).toBe(CANVAS_HEIGHT / 2 - 20)
    expect(placement.rotationDeg).toBe(90)
  })
})

describe('describeFrame', () => {
  it('lists the layers at the playhead in draw order, bottom track first', () => {
    const frame = describeFrame(timeline(), 500)
    expect(frame.width).toBe(CANVAS_WIDTH)
    expect(frame.height).toBe(CANVAS_HEIGHT)
    expect(frame.tMs).toBe(500)
    expect(frame.layers.map((layer) => layer.clipId)).toEqual(['a', 'b'])
  })

  it('gives each layer the source time at the playhead', () => {
    const frame = describeFrame(timeline(), 300)
    expect(frame.layers[0].sourceTimeMs).toBe(800)
  })

  it('uses the size of each media item when it is known', () => {
    const frame = describeFrame(timeline(), 500, (mediaId) =>
      mediaId === 'm1' ? { width: 1920, height: 1080 } : null
    )
    expect(frame.layers[0].placement.height).toBeLessThan(CANVAS_HEIGHT)
    expect(frame.layers[1].placement.width).toBeCloseTo(CANVAS_WIDTH * 0.5)
  })

  it('leaves out layers on muted tracks and clips that have ended', () => {
    const muted = timeline()
    muted.tracks[1].muted = true
    expect(describeFrame(muted, 500).layers.map((layer) => layer.clipId)).toEqual(['a'])
    expect(describeFrame(timeline(), 1500).layers.map((layer) => layer.clipId)).toEqual(['b'])
  })

  it('describes an empty frame when nothing is on the playhead', () => {
    expect(describeFrame(timeline(), 5000).layers).toEqual([])
  })
})

describe('hasClips', () => {
  it('is false for a timeline with no clips on any track', () => {
    expect(hasClips({ tracks: [] })).toBe(false)
    expect(
      hasClips({ tracks: [{ id: 't', kind: 'video', role: 'main', muted: false, clips: [] }] })
    ).toBe(false)
  })

  it('is true once any track holds a clip', () => {
    expect(hasClips(timeline())).toBe(true)
  })
})
