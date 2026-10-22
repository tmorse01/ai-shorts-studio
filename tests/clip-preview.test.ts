import { describe, expect, it } from 'vitest'
import { activeCaption, frameAspect, videoStyle } from '../src/renderer/editor/preview-math'

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

  it('returns the caption on screen at a source time, using a half-open interval', () => {
    expect(activeCaption(captions, 3)?.text).toBe('first')
    expect(activeCaption(captions, 4)?.text).toBe('second')
    expect(activeCaption(captions, 6)).toBeNull()
    expect(activeCaption(captions, 1)).toBeNull()
  })
})

describe('clip playback steps', () => {
  const cuts = [
    { startSec: 10, endSec: 20 },
    { startSec: 50, endSec: 55 }
  ]

  it('keeps playing inside a cut', async () => {
    const { playbackStep } = await import('../src/renderer/editor/preview-math')
    expect(playbackStep(cuts, 12)).toEqual({ kind: 'play' })
    expect(playbackStep(cuts, 50)).toEqual({ kind: 'play' })
  })

  it('jumps across a gap to the next cut', async () => {
    const { playbackStep } = await import('../src/renderer/editor/preview-math')
    expect(playbackStep(cuts, 25)).toEqual({ kind: 'seek', sec: 50 })
    expect(playbackStep(cuts, 3)).toEqual({ kind: 'seek', sec: 10 })
  })

  it('ends after the last cut and when there are no cuts', async () => {
    const { playbackStep } = await import('../src/renderer/editor/preview-math')
    expect(playbackStep(cuts, 55)).toEqual({ kind: 'end' })
    expect(playbackStep(cuts, 99)).toEqual({ kind: 'end' })
    expect(playbackStep([], 5)).toEqual({ kind: 'end' })
  })
})
