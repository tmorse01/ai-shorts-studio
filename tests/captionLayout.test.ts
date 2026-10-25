import { describe, expect, it } from 'vitest'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import {
  CAPTION_ANCHOR_Y,
  CAPTION_SAFE_INSETS,
  captionCenterY,
  describeCaptionBlock,
  describeCaptions,
  wrapWordIndexes
} from '@shared/captions/captionLayout'
import {
  DEFAULT_CAPTION_PRESETS,
  captionPresetSchema,
  resolveCaptionPreset,
  type CaptionPreset
} from '@shared/captions/captionPreset'
import { describeFrame, CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/compositor/frame'
import { LayerRegistry, layerKindOf } from '@shared/compositor/layerRegistry'
import type { Timeline } from '@shared/timeline/timeline'
import { SAFE_ZONE_INSETS } from '@shared/preview/previewView'

const PRESETS = DEFAULT_CAPTION_PRESETS
const CANVAS = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }

const block: CaptionBlock = {
  id: 'b1',
  words: [
    { text: 'hello', startMs: 1000, endMs: 1400 },
    { text: 'there', startMs: 1500, endMs: 1900 },
    { text: 'friend', startMs: 2000, endMs: 2500 }
  ]
}

function captionTimeline(captions: CaptionBlock[]): Timeline {
  return {
    tracks: [{ id: 'cap', kind: 'text', role: 'captions', muted: false, clips: [], captions }]
  }
}

describe('wrapWordIndexes', () => {
  it('breaks lines so no line passes the limit, keeping word order', () => {
    expect(wrapWordIndexes([5, 5, 5, 5], 11)).toEqual([
      [0, 1],
      [2, 3]
    ])
  })

  it('gives a word longer than the limit a line of its own', () => {
    expect(wrapWordIndexes([3, 20, 3], 10)).toEqual([[0], [1], [2]])
  })

  it('returns no lines for no words', () => {
    expect(wrapWordIndexes([], 10)).toEqual([])
  })
})

describe('captionCenterY', () => {
  it('sits at the lower-third anchor without safe zones', () => {
    expect(captionCenterY(1920, 100, null)).toBeCloseTo(1920 * CAPTION_ANCHOR_Y, 10)
  })

  it('keeps the whole box inside the safe band', () => {
    const top = 1920 * CAPTION_SAFE_INSETS.top
    const bottom = 1920 * (1 - CAPTION_SAFE_INSETS.bottom)
    // A box at the anchor would reach past the bottom inset, so it is pulled up.
    const y = captionCenterY(1920, 200, CAPTION_SAFE_INSETS)
    expect(y + 100).toBeLessThanOrEqual(bottom)
    expect(y - 100).toBeGreaterThanOrEqual(top)
  })

  it('centres a box taller than the safe band', () => {
    const top = 1920 * CAPTION_SAFE_INSETS.top
    const bottom = 1920 * (1 - CAPTION_SAFE_INSETS.bottom)
    expect(captionCenterY(1920, bottom - top + 50, CAPTION_SAFE_INSETS)).toBeCloseTo(
      (top + bottom) / 2,
      10
    )
  })
})

describe('describeCaptionBlock', () => {
  it('highlights only the spoken word', () => {
    const render = describeCaptionBlock(block, 1600, PRESETS[0] as CaptionPreset, CANVAS, {
      safeZones: true
    })
    const words = render.lines.flat()
    expect(words.map((word) => word.text)).toEqual(['hello', 'there', 'friend'])
    expect(words.map((word) => word.highlighted)).toEqual([false, true, false])
  })

  it('highlights nothing when the preset turns word highlight off', () => {
    const editorial = PRESETS.find((preset) => preset.id === 'editorial') as CaptionPreset
    const render = describeCaptionBlock(block, 1600, editorial, CANVAS, { safeZones: true })
    expect(render.lines.flat().some((word) => word.highlighted)).toBe(false)
    expect(render.scale).toBe(1)
  })

  it('uppercases words when the preset asks', () => {
    const bold = PRESETS.find((preset) => preset.id === 'bold') as CaptionPreset
    const render = describeCaptionBlock(block, 1600, bold, CANVAS, { safeZones: true })
    expect(render.lines.flat()[0]?.text).toBe('HELLO')
  })

  it('pops in from the start of the block', () => {
    const classic = PRESETS[0] as CaptionPreset
    const early = describeCaptionBlock(block, 1000, classic, CANVAS, { safeZones: true })
    expect(early.scale).toBeLessThan(1)
  })

  it('draws the stroke colour from the palette', () => {
    const classic = PRESETS[0] as CaptionPreset
    const render = describeCaptionBlock(block, 1600, classic, CANVAS, { safeZones: true })
    expect(render.stroke?.color).toBe('#050606')
    expect(render.fill).toBe('#f5f5f0')
  })
})

describe('resolveCaptionPreset', () => {
  it('prefers the block override, then the short default, then the project default', () => {
    expect(resolveCaptionPreset(PRESETS, 'bold', 'editorial').id).toBe('editorial')
    expect(resolveCaptionPreset(PRESETS, 'bold', undefined).id).toBe('bold')
    expect(resolveCaptionPreset(PRESETS, undefined, undefined).id).toBe('classic')
  })

  it('skips an id the project does not have', () => {
    expect(resolveCaptionPreset(PRESETS, 'gone', 'missing').id).toBe('classic')
  })
})

describe('describeCaptions', () => {
  it('returns only blocks on screen at the time, from captions tracks', () => {
    const timeline = captionTimeline([block])
    expect(describeCaptions(timeline, 500, CANVAS, { presets: PRESETS, safeZones: true })).toEqual(
      []
    )
    const active = describeCaptions(timeline, 1600, CANVAS, { presets: PRESETS, safeZones: true })
    expect(active.map((item) => item.block.id)).toEqual(['b1'])
  })

  it('uses the short preset for blocks without an override', () => {
    const timeline = captionTimeline([block])
    const [active] = describeCaptions(timeline, 1600, CANVAS, {
      presets: PRESETS,
      shortPresetId: 'bold',
      safeZones: true
    })
    expect(active?.render.lines.flat()[0]?.text).toBe('HELLO')
  })
})

describe('describeFrame caption layers', () => {
  it('adds a caption layer drawn last, routed to the caption renderer', () => {
    const timeline = captionTimeline([block])
    const frame = describeFrame(timeline, 1600)
    const caption = frame.layers.at(-1)
    expect(caption?.captions).toBeDefined()
    expect(caption && layerKindOf(caption)).toBe('caption')
    expect(caption?.clipId).toBe('b1')
  })

  it('renders caption layers through the caption registration', () => {
    const registry = new LayerRegistry<string[]>()
    const seen: string[] = []
    registry.register('caption', (layer) => seen.push(layer.clipId))
    registry.renderFrame(describeFrame(captionTimeline([block]), 1600), seen)
    expect(seen).toEqual(['b1'])
  })

  it('uses the platform safe zone when one is given', () => {
    const plain = describeCaptions(captionTimeline([block]), 1600, CANVAS, {
      presets: PRESETS,
      safeZones: true,
      insets: SAFE_ZONE_INSETS.reels
    })[0]
    expect(plain?.render.centerY).toBeLessThanOrEqual(
      CANVAS_HEIGHT * (1 - SAFE_ZONE_INSETS.reels.bottom)
    )
  })
})

describe('caption preset schema', () => {
  it('accepts the shipped presets', () => {
    for (const preset of PRESETS) expect(captionPresetSchema.safeParse(preset).success).toBe(true)
  })

  it('rejects an unknown colour', () => {
    const bad = { ...PRESETS[0], fill: 'red' }
    expect(captionPresetSchema.safeParse(bad).success).toBe(false)
  })
})
