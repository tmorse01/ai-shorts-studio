import { describe, expect, it } from 'vitest'
import {
  BLUR_FIT_DEFAULTS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  describeFrame
} from '@shared/compositor/frame'
import type { Timeline } from '@shared/timeline/timeline'
import { Compositor } from '../src/renderer/features/compositor/compositor'
import type { FrameBackend, VideoEffect } from '../src/renderer/features/compositor/frameBackend'
import { createLayerRegistry } from '../src/renderer/features/compositor/layerRenderers'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }
const LANDSCAPE = { width: 1920, height: 1080 }

function timeline(framing?: Timeline['tracks'][number]['clips'][number]['framing']): Timeline {
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
            sourceInMs: 0,
            transform: IDENTITY,
            framing
          }
        ]
      }
    ]
  }
}

const blurFit = { mode: 'blurFit' as const, x: 0, y: 0, scale: 1 }
const sizeOf = () => LANDSCAPE

describe('blurFit render description', () => {
  it('describes a blurFit video as a blurred background with the whole source on top', () => {
    const [layer] = describeFrame(timeline(blurFit), 500, sizeOf).layers
    expect(layer.render.mode).toBe('blurFit')
    if (layer.render.mode !== 'blurFit') return
    expect(layer.render.blurPx).toBe(BLUR_FIT_DEFAULTS.blurPx)
    expect(layer.render.dim).toBe(BLUR_FIT_DEFAULTS.dim)
    // The foreground is the source fitted in the frame: full width, letterboxed height.
    expect(layer.render.foreground).toEqual(layer.placement)
    expect(layer.render.foreground.width).toBeCloseTo(CANVAS_WIDTH)
    expect(layer.render.foreground.height).toBeCloseTo((1080 * CANVAS_WIDTH) / 1920)
  })

  it('covers the canvas with the background, padded by the blur, at the source aspect', () => {
    const [layer] = describeFrame(timeline(blurFit), 500, sizeOf).layers
    if (layer.render.mode !== 'blurFit') throw new Error('expected blurFit')
    const { background } = layer.render
    const pad = BLUR_FIT_DEFAULTS.blurPx * 4
    expect(background.width).toBeGreaterThanOrEqual(CANVAS_WIDTH + pad - 1e-6)
    expect(background.height).toBeGreaterThanOrEqual(CANVAS_HEIGHT + pad - 1e-6)
    expect(background.width / background.height).toBeCloseTo(1920 / 1080)
    expect(background.centerX).toBe(CANVAS_WIDTH / 2)
    expect(background.centerY).toBe(CANVAS_HEIGHT / 2)
    expect(background.rotationDeg).toBe(0)
  })

  it('fills the padded canvas with the background when the source size is unknown', () => {
    const [layer] = describeFrame(timeline(blurFit), 500).layers
    if (layer.render.mode !== 'blurFit') throw new Error('expected blurFit')
    expect(layer.render.background.width).toBe(CANVAS_WIDTH + BLUR_FIT_DEFAULTS.blurPx * 4)
    expect(layer.render.background.height).toBe(CANVAS_HEIGHT + BLUR_FIT_DEFAULTS.blurPx * 4)
  })

  it('draws a fill clip and an unframed clip direct, with no background', () => {
    const fill = describeFrame(timeline({ ...blurFit, mode: 'fill' }), 500, sizeOf).layers[0]
    const unframed = describeFrame(timeline(), 500, sizeOf).layers[0]
    expect(fill.render).toEqual({ mode: 'direct' })
    expect(unframed.render).toEqual({ mode: 'direct' })
  })

  it('draws the blurred background, then the foreground, through the compositor', () => {
    const drawn: { name: string; effect: VideoEffect | undefined }[] = []
    const backend: FrameBackend = {
      kind: '2d',
      clear: () => undefined,
      drawBitmap: () => undefined,
      drawVideo: (element, _placement, effect) =>
        drawn.push({ name: (element as unknown as { name: string }).name, effect }),
      dispose: () => undefined
    }
    const element = { name: 'm1', readyState: 2, videoWidth: 1920 } as unknown as HTMLVideoElement
    const compositor = new Compositor(backend, createLayerRegistry())
    compositor.render(describeFrame(timeline(blurFit), 500, sizeOf), () => ({
      state: 'ready',
      element
    }))
    expect(drawn).toEqual([
      {
        name: 'm1',
        effect: { blurPx: BLUR_FIT_DEFAULTS.blurPx, dim: BLUR_FIT_DEFAULTS.dim }
      },
      { name: 'm1', effect: undefined }
    ])
  })
})
