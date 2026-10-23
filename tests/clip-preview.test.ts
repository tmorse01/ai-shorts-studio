import { describe, expect, it } from 'vitest'
import { activeCaption, cutAt, frameAspect, nextCutAt, videoStyle } from '../src/renderer/editor/preview-math'

const landscape = { width: 1280, height: 720 }

describe('preview framing', () => {
  it('reports the frame aspect for each ratio', () => {
    expect(frameAspect('9:16', landscape)).toBeCloseTo(9 / 16, 5)
    expect(frameAspect('1:1', landscape)).toBe(1)
    expect(frameAspect('original', landscape)).toBeCloseTo(16 / 9, 2)
  })

  it('scales and offsets the video so the centred crop fills the frame', () => {
    // 9:16 from 16:9 keeps a 404px-wide window centred at x=438 (see cropRect).
    const style = videoStyle({ x: 0.5, y: 0.5, mode: 'crop' }, '9:16', landscape)
    expect(parseFloat(String(style.width))).toBeCloseTo((1280 / 404) * 100, 1)
    expect(parseFloat(String(style.height))).toBeCloseTo(100, 5)
    expect(parseFloat(String(style.left))).toBeCloseTo(-(438 / 404) * 100, 1)
    expect(parseFloat(String(style.top))).toBeCloseTo(0, 5)
  })

  it('moves the crop window to the framing edge', () => {
    const left = videoStyle({ x: 0, y: 0.5, mode: 'crop' }, '9:16', landscape)
    expect(parseFloat(String(left.left))).toBeCloseTo(0, 5)
  })

  it('letterboxes instead of cropping in fit mode', () => {
    const style = videoStyle({ x: 0.5, y: 0.5, mode: 'fit' }, '9:16', landscape)
    expect(style.objectFit).toBe('contain')
    expect(style.width).toBe('100%')
  })
})

describe('caption lookup', () => {
  const captions = [
    { startSec: 2, endSec: 4, text: 'first' },
    { startSec: 4, endSec: 6, text: 'second' }
  ]

  it('returns the caption on screen at a timeline time, using a half-open interval', () => {
    expect(activeCaption(captions, 3)?.text).toBe('first')
    expect(activeCaption(captions, 4)?.text).toBe('second')
    expect(activeCaption(captions, 6)).toBeNull()
    expect(activeCaption(captions, 1)).toBeNull()
  })
})

describe('cut under the playhead', () => {
  // Cut one plays 0–10 s on the timeline, then 5 s of blank, then cut two plays 15–20 s.
  const cuts = [
    { startSec: 10, endSec: 20, atSec: 0 },
    { startSec: 50, endSec: 55, atSec: 15 }
  ]

  it('finds the cut playing at a timeline time', () => {
    expect(cutAt(cuts, 3)).toBe(0)
    expect(cutAt(cuts, 16)).toBe(1)
  })

  it('is -1 over blank space, and at the very end', () => {
    expect(cutAt(cuts, 12)).toBe(-1)
    expect(cutAt(cuts, 10)).toBe(-1)
    expect(cutAt(cuts, 20)).toBe(-1)
  })

  it('finds the next cut to start after a time, for when a gap ends', () => {
    expect(nextCutAt(cuts, 12)).toBe(1)
    expect(nextCutAt(cuts, 0)).toBe(0)
    expect(nextCutAt(cuts, 16)).toBe(-1)
  })
})
