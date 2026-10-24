import { describe, expect, it } from 'vitest'
import {
  clampFramingScale,
  clipFramingSchema,
  clipProgress,
  coverCropSize,
  easeInOut,
  framingCropRect,
  interpolatePose,
  MAX_FRAMING_SCALE,
  MIN_FRAMING_SCALE,
  resolveFramingAt
} from '@shared/timeline/framing'
import { resolveFrame } from '@shared/timeline/resolveFrame'
import { IDENTITY_TRANSFORM, timelineSchema, type Timeline } from '@shared/timeline/timeline'

const OUT_W = 1080
const OUT_H = 1920

// Every crop must sit inside the source. A small tolerance absorbs floating point error.
function expectInsideSource(
  rect: { x: number; y: number; width: number; height: number },
  srcW: number,
  srcH: number
) {
  const eps = 1e-6
  expect(rect.x).toBeGreaterThanOrEqual(-eps)
  expect(rect.y).toBeGreaterThanOrEqual(-eps)
  expect(rect.x + rect.width).toBeLessThanOrEqual(srcW + eps)
  expect(rect.y + rect.height).toBeLessThanOrEqual(srcH + eps)
}

describe('coverCropSize', () => {
  it('crops the sides of a landscape source to a portrait frame', () => {
    const cover = coverCropSize(1920, 1080, OUT_W, OUT_H)
    expect(cover.height).toBe(1080)
    expect(cover.width).toBeCloseTo(1080 * (OUT_W / OUT_H))
  })

  it('crops the top and bottom of a source already taller than the frame aspect', () => {
    expect(coverCropSize(1080, 1920, OUT_W, OUT_H)).toEqual({ width: 1080, height: 1920 })
    expect(coverCropSize(1000, 2000, OUT_W, OUT_H).width).toBe(1000)
  })
})

describe('framingCropRect (fill)', () => {
  const centred = { mode: 'fill' as const, x: 0, y: 0, scale: 1 }

  it('centres the cover crop at scale 1 and x, y 0', () => {
    const rect = framingCropRect(1920, 1080, OUT_W, OUT_H, centred)
    const cover = coverCropSize(1920, 1080, OUT_W, OUT_H)
    expect(rect.width).toBeCloseTo(cover.width)
    expect(rect.height).toBeCloseTo(cover.height)
    expect(rect.x).toBeCloseTo((1920 - cover.width) / 2)
    expect(rect.y).toBeCloseTo(0)
  })

  it('keeps the crop aspect ratio equal to the output at every zoom', () => {
    for (const scale of [1, 1.5, 2, MAX_FRAMING_SCALE]) {
      const rect = framingCropRect(1920, 1080, OUT_W, OUT_H, { ...centred, scale })
      expect(rect.width / rect.height).toBeCloseTo(OUT_W / OUT_H)
    }
  })

  it('shrinks the crop as the zoom grows', () => {
    const wide = framingCropRect(1920, 1080, OUT_W, OUT_H, centred)
    const zoomed = framingCropRect(1920, 1080, OUT_W, OUT_H, { ...centred, scale: 2 })
    expect(zoomed.width).toBeCloseTo(wide.width / 2)
    expect(zoomed.height).toBeCloseTo(wide.height / 2)
  })

  it('moves the crop to the source edges at x of -1 and 1', () => {
    const left = framingCropRect(1920, 1080, OUT_W, OUT_H, { ...centred, x: -1, scale: 2 })
    const right = framingCropRect(1920, 1080, OUT_W, OUT_H, { ...centred, x: 1, scale: 2 })
    expect(left.x).toBeCloseTo(0)
    expect(right.x + right.width).toBeCloseTo(1920)
  })

  it('never leaves the source, even with out-of-range pose values', () => {
    for (const x of [-5, -1, -0.3, 0, 0.7, 1, 9]) {
      for (const y of [-2, 0, 1, 3]) {
        for (const scale of [0.2, 1, 3, 4, 50]) {
          const rect = framingCropRect(1920, 1080, OUT_W, OUT_H, { mode: 'fill', x, y, scale })
          expectInsideSource(rect, 1920, 1080)
        }
      }
    }
  })

  it('handles a source that is already the frame aspect', () => {
    const rect = framingCropRect(1080, 1920, OUT_W, OUT_H, { ...centred, x: 1, y: -1, scale: 3 })
    expect(rect.width).toBeCloseTo(1080 / 3)
    expect(rect.x).toBeCloseTo(1080 - rect.width)
    expectInsideSource(rect, 1080, 1920)
  })
})

describe('framingCropRect (blurFit)', () => {
  it('shows the whole source whatever the pose', () => {
    const rect = framingCropRect(1920, 1080, OUT_W, OUT_H, {
      mode: 'blurFit',
      x: 1,
      y: 1,
      scale: 4
    })
    expect(rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })
})

describe('scale limits', () => {
  it('clamps scale to the zoom range', () => {
    expect(clampFramingScale(0.1)).toBe(MIN_FRAMING_SCALE)
    expect(clampFramingScale(2)).toBe(2)
    expect(clampFramingScale(99)).toBe(MAX_FRAMING_SCALE)
    expect(clampFramingScale(Number.NaN)).toBe(MIN_FRAMING_SCALE)
  })

  it('rejects a stored scale outside the range', () => {
    const base = { mode: 'fill', x: 0, y: 0 }
    expect(clipFramingSchema.safeParse({ ...base, scale: 0.5 }).success).toBe(false)
    expect(clipFramingSchema.safeParse({ ...base, scale: MAX_FRAMING_SCALE + 1 }).success).toBe(
      false
    )
    expect(clipFramingSchema.safeParse({ ...base, scale: 1 }).success).toBe(true)
  })

  it('rejects an unknown mode', () => {
    expect(clipFramingSchema.safeParse({ mode: 'stretch', x: 0, y: 0, scale: 1 }).success).toBe(
      false
    )
  })
})

describe('pan interpolation', () => {
  const from = { x: -1, y: 0, scale: 1 }
  const to = { x: 1, y: 0.5, scale: 2 }

  it('eases from 0 to 1 and is flat at both ends', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(0.1)).toBeLessThan(0.1)
    expect(easeInOut(0.9)).toBeGreaterThan(0.9)
  })

  it('returns the start and end poses at the ends of the pan', () => {
    expect(interpolatePose(from, to, 0)).toEqual(from)
    expect(interpolatePose(from, to, 1)).toEqual(to)
  })

  it('lands halfway at the midpoint', () => {
    expect(interpolatePose(from, to, 0.5)).toEqual({ x: 0, y: 0.25, scale: 1.5 })
  })

  it('measures progress across the clip and clamps outside it', () => {
    expect(clipProgress(1000, 2000, 1000)).toBe(0)
    expect(clipProgress(1000, 2000, 2000)).toBe(0.5)
    expect(clipProgress(1000, 2000, 3000)).toBe(1)
    expect(clipProgress(1000, 2000, 500)).toBe(0)
    expect(clipProgress(1000, 0, 1000)).toBe(1)
  })

  it('holds the pose when there is no panTo', () => {
    const framing = { mode: 'fill' as const, x: 0.5, y: 0, scale: 2 }
    expect(resolveFramingAt(framing, 0, 4000, 0)).toEqual({ mode: 'fill', x: 0.5, y: 0, scale: 2 })
    expect(resolveFramingAt(framing, 0, 4000, 3999)).toEqual({
      mode: 'fill',
      x: 0.5,
      y: 0,
      scale: 2
    })
  })

  it('eases from the framing pose to panTo across the clip', () => {
    const framing = { mode: 'fill' as const, ...from, panTo: to }
    expect(resolveFramingAt(framing, 1000, 2000, 1000)).toEqual({ mode: 'fill', ...from })
    expect(resolveFramingAt(framing, 1000, 2000, 2000)).toEqual({
      mode: 'fill',
      x: 0,
      y: 0.25,
      scale: 1.5
    })
    expect(resolveFramingAt(framing, 1000, 2000, 3000)).toEqual({ mode: 'fill', ...to })
  })
})

describe('resolveFrame with framing', () => {
  const timeline: Timeline = {
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
            durationMs: 2000,
            sourceInMs: 0,
            transform: IDENTITY_TRANSFORM,
            framing: {
              mode: 'fill',
              x: -1,
              y: 0,
              scale: 1,
              panTo: { x: 1, y: 0, scale: 2 }
            }
          },
          {
            id: 'b',
            mediaId: 'm1',
            startMs: 2000,
            durationMs: 1000,
            sourceInMs: 0,
            transform: IDENTITY_TRANSFORM
          }
        ]
      }
    ]
  }

  it('adds the eased framing pose to a framed clip at any time', () => {
    const [start] = resolveFrame(timeline, 0)
    expect(start.framing).toEqual({ mode: 'fill', x: -1, y: 0, scale: 1 })
    const [mid] = resolveFrame(timeline, 1000)
    expect(mid.framing).toEqual({ mode: 'fill', x: 0, y: 0, scale: 1.5 })
    const [end] = resolveFrame(timeline, 1999)
    expect(end.framing?.x).toBeGreaterThan(0.99)
  })

  it('leaves framing off a clip that has none', () => {
    const [plain] = resolveFrame(timeline, 2500)
    expect(plain).not.toHaveProperty('framing')
  })

  it('accepts framing on a clip in the timeline schema', () => {
    expect(timelineSchema.safeParse(timeline).success).toBe(true)
  })
})
