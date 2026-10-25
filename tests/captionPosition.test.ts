import { describe, expect, it } from 'vitest'
import {
  CAPTION_POSITION_ANCHOR,
  DEFAULT_CAPTION_PRESETS,
  DEFAULT_WORDS_PER_CAPTION,
  captionAnchorOf,
  captionPresetSchema,
  wordsPerCaptionOf
} from '../src/shared/captions/captionPreset'
import { describeCaptionBlock } from '../src/shared/captions/captionLayout'
import type { CaptionBlock } from '../src/shared/captions/captionBlock'

const CANVAS = { width: 1080, height: 1920 }
const block: CaptionBlock = {
  id: 'b1',
  words: [{ text: 'hello', startMs: 0, endMs: 400 }]
}

describe('caption position', () => {
  const base = DEFAULT_CAPTION_PRESETS[0]
  if (!base) throw new Error('missing default preset')

  it('keeps the lower third when no position is set', () => {
    expect(captionAnchorOf(base)).toBe(CAPTION_POSITION_ANCHOR.bottom)
  })

  it('places the caption centre at the chosen anchor when safe zones are off', () => {
    const top = describeCaptionBlock(block, 100, { ...base, position: 'top' }, CANVAS, {
      safeZones: false
    })
    const middle = describeCaptionBlock(block, 100, { ...base, position: 'middle' }, CANVAS, {
      safeZones: false
    })
    expect(top.centerY).toBeCloseTo(CANVAS.height * 0.2, 6)
    expect(middle.centerY).toBeCloseTo(CANVAS.height * 0.5, 6)
  })
})

describe('caption words per caption', () => {
  it('defaults to four words and reads the preset when set', () => {
    const base = DEFAULT_CAPTION_PRESETS[0]
    if (!base) throw new Error('missing default preset')
    expect(wordsPerCaptionOf(base)).toBe(DEFAULT_WORDS_PER_CAPTION)
    expect(wordsPerCaptionOf({ ...base, wordsPerCaption: 2 })).toBe(2)
  })
})

describe('caption preset schema', () => {
  const base = DEFAULT_CAPTION_PRESETS[0]
  if (!base) throw new Error('missing default preset')

  it('accepts a known position and a words-per-caption count in range', () => {
    expect(
      captionPresetSchema.safeParse({ ...base, position: 'top', wordsPerCaption: 6 }).success
    ).toBe(true)
  })

  it('refuses an unknown position and a count out of range', () => {
    expect(captionPresetSchema.safeParse({ ...base, position: 'left' }).success).toBe(false)
    expect(captionPresetSchema.safeParse({ ...base, wordsPerCaption: 13 }).success).toBe(false)
    expect(captionPresetSchema.safeParse({ ...base, wordsPerCaption: 0 }).success).toBe(false)
  })
})
