import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH, describeFrame } from '@shared/compositor/frame'
import { createTextItem, textItemSchema, type TextItem } from '@shared/text/textItem'
import { TEXT_FADE_MS, describeText, textMotionAlpha, wrapLines } from '@shared/text/textRender'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'

const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }

function textTimeline(item: TextItem, startMs = 0, durationMs = 2000): Timeline {
  return {
    tracks: [
      {
        id: 'text-1',
        kind: 'text',
        role: 'text',
        muted: false,
        clips: [
          {
            id: 'clip-text',
            startMs,
            durationMs,
            sourceInMs: 0,
            transform: IDENTITY_TRANSFORM,
            textItem: item
          }
        ]
      }
    ]
  }
}

describe('text item schema', () => {
  it('accepts a new item in the caption style', () => {
    expect(textItemSchema.parse(createTextItem('Hello')).styleId).toBe('caption')
  })

  it('rejects an unknown style, an anchor outside the frame and a zero scale', () => {
    expect(() => textItemSchema.parse({ ...createTextItem('a'), styleId: 'comic' })).toThrow()
    expect(() => textItemSchema.parse({ ...createTextItem('a'), x: 1.5 })).toThrow()
    expect(() => textItemSchema.parse({ ...createTextItem('a'), scale: 0 })).toThrow()
  })
})

describe('describeText', () => {
  it('places the text centre from the anchor fractions', () => {
    const render = describeText({ ...createTextItem('Hi'), x: 0.25, y: 0.8 }, 0, 2000, canvas)
    expect(render?.centerX).toBeCloseTo(CANVAS_WIDTH * 0.25)
    expect(render?.centerY).toBeCloseTo(CANVAS_HEIGHT * 0.8)
  })

  it('scales the font size and stroke with the item scale', () => {
    const base = describeText(createTextItem('Hi'), 0, 2000, canvas)
    const big = describeText({ ...createTextItem('Hi'), scale: 2 }, 0, 2000, canvas)
    expect(big?.fontSizePx).toBeCloseTo((base?.fontSizePx ?? 0) * 2)
    expect(big?.stroke?.widthPx).toBeCloseTo((base?.stroke?.widthPx ?? 0) * 2)
    expect(big?.fontCss.startsWith('600 128px')).toBe(true)
  })

  it('upper-cases text for a style that asks for it', () => {
    const render = describeText(createTextItem('quiet room', 'heading'), 0, 2000, canvas)
    expect(render?.lines).toEqual(['QUIET ROOM'])
    expect(describeText(createTextItem('quiet room'), 0, 2000, canvas)?.lines).toEqual([
      'quiet room'
    ])
  })

  it('returns null for blank text', () => {
    expect(describeText(createTextItem('   '), 0, 2000, canvas)).toBeNull()
  })

  it('uses palette hex values', () => {
    expect(describeText(createTextItem('Hi', 'display'), 0, 2000, canvas)?.fill).toBe('#f0e8d5')
    expect(describeText(createTextItem('Hi'), 0, 2000, canvas)?.stroke?.color).toBe('#050606')
  })
})

describe('wrapLines', () => {
  it('breaks words to fit the width and keeps explicit breaks', () => {
    expect(wrapLines('one two three four', 10, 1)).toEqual(['one two', 'three four'])
    expect(wrapLines('one two three four', 9, 1)).toEqual(['one two', 'three', 'four'])
    expect(wrapLines('a\nb', 10, 1)).toEqual(['a', 'b'])
  })

  it('keeps a word wider than the line whole', () => {
    expect(wrapLines('extraordinarily long', 5, 1)).toEqual(['extraordinarily', 'long'])
  })
})

describe('textMotionAlpha', () => {
  it('fades in and out over the motion length', () => {
    const motion = { enter: 'fade', exit: 'fade' } as const
    expect(textMotionAlpha(motion, 0, 2000)).toBe(0)
    expect(textMotionAlpha(motion, TEXT_FADE_MS / 2, 2000)).toBeCloseTo(0.5)
    expect(textMotionAlpha(motion, 1000, 2000)).toBe(1)
    expect(textMotionAlpha(motion, 2000 - TEXT_FADE_MS / 2, 2000)).toBeCloseTo(0.5)
  })

  it('cuts when no motion is set', () => {
    expect(textMotionAlpha({}, 0, 2000)).toBe(1)
    expect(textMotionAlpha({}, 1999, 2000)).toBe(1)
  })

  it('fades a short clip for half its length', () => {
    expect(textMotionAlpha({ enter: 'fade' }, 100, 200)).toBeCloseTo(1)
    expect(textMotionAlpha({ enter: 'fade' }, 50, 200)).toBeCloseTo(0.5)
  })
})

describe('describeFrame text layers', () => {
  it('describes a text clip on the frame with its anchor and motion', () => {
    const item = { ...createTextItem('Hook'), x: 0.5, y: 0.2, enter: 'fade' as const }
    const frame = describeFrame(textTimeline(item, 1000, 2000), 1000)
    const layer = frame.layers[0]
    expect(layer.trackKind).toBe('text')
    expect(layer.text?.lines).toEqual(['Hook'])
    expect(layer.text?.centerY).toBeCloseTo(CANVAS_HEIGHT * 0.2)
    expect(layer.text?.alpha).toBe(0)
  })

  it('draws a text clip at full opacity once its enter fade is over', () => {
    const frame = describeFrame(textTimeline(createTextItem('Hook'), 0, 2000), 1000)
    expect(frame.layers[0].text?.alpha).toBe(1)
  })
})
