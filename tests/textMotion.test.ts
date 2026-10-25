import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/compositor/frame'
import { createTextItem, textItemSchema } from '@shared/text/textItem'
import { withMotionMs } from '@shared/text/textEdits'
import {
  TEXT_MOTION_DEFAULT_MS,
  TEXT_SLIDE_FRACTION,
  textMotionTransform
} from '@shared/text/textMotion'
import { describeText, revealLines } from '@shared/text/textRender'
import { matchTextPreset } from '@shared/text/textPresets'

const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
const DURATION = 2000
const M = TEXT_MOTION_DEFAULT_MS

describe('textMotionTransform', () => {
  it('fades in and out linearly over the motion length', () => {
    const spec = { enter: 'fade', exit: 'fade' } as const
    expect(textMotionTransform(spec, 0, DURATION).alpha).toBe(0)
    expect(textMotionTransform(spec, M / 2, DURATION).alpha).toBeCloseTo(0.5)
    expect(textMotionTransform(spec, 1000, DURATION).alpha).toBe(1)
    expect(textMotionTransform(spec, DURATION - M / 2, DURATION).alpha).toBeCloseTo(0.5)
  })

  it('rests with no motion set, and for the none motion', () => {
    expect(textMotionTransform({}, 0, DURATION).alpha).toBe(1)
    expect(textMotionTransform({ enter: 'none', exit: 'none' }, 0, DURATION)).toMatchObject({
      alpha: 1,
      dxFrac: 0,
      dyFrac: 0,
      scale: 1,
      reveal: 1
    })
  })

  it('slides in from the named edge and back out to it', () => {
    const left = textMotionTransform({ enter: 'slide-left' }, 0, DURATION)
    expect(left.dxFrac).toBeCloseTo(-TEXT_SLIDE_FRACTION)
    expect(left.alpha).toBe(0)
    expect(textMotionTransform({ enter: 'slide-left' }, M, DURATION).dxFrac).toBe(0)

    expect(textMotionTransform({ exit: 'slide-right' }, DURATION, DURATION).dxFrac).toBeCloseTo(
      TEXT_SLIDE_FRACTION
    )
    expect(textMotionTransform({ enter: 'slide-top' }, 0, DURATION).dyFrac).toBeCloseTo(
      -TEXT_SLIDE_FRACTION
    )
    expect(textMotionTransform({ enter: 'slide-bottom' }, 0, DURATION).dyFrac).toBeCloseTo(
      TEXT_SLIDE_FRACTION
    )
  })

  it('pops from nothing, overshooting once before it settles', () => {
    expect(textMotionTransform({ enter: 'pop' }, 0, DURATION).scale).toBeCloseTo(0)
    expect(textMotionTransform({ enter: 'pop' }, M, DURATION).scale).toBeCloseTo(1)
    const samples = Array.from(
      { length: 20 },
      (_, index) => textMotionTransform({ enter: 'pop' }, (index / 20) * M, DURATION).scale
    )
    expect(Math.max(...samples)).toBeGreaterThan(1)
    expect(textMotionTransform({ exit: 'pop' }, DURATION, DURATION).scale).toBeCloseTo(0)
  })

  it('reveals the text letter by letter', () => {
    expect(textMotionTransform({ enter: 'typewriter' }, 0, DURATION).reveal).toBe(0)
    expect(textMotionTransform({ enter: 'typewriter' }, M / 2, DURATION).reveal).toBeCloseTo(0.5)
    expect(textMotionTransform({ exit: 'typewriter' }, DURATION, DURATION).reveal).toBe(0)
  })

  it('uses the item motion length, and never more than half the clip', () => {
    expect(textMotionTransform({ enter: 'fade', motionMs: 500 }, 250, DURATION).alpha).toBeCloseTo(
      0.5
    )
    expect(textMotionTransform({ enter: 'fade' }, 50, 200).alpha).toBeCloseTo(0.5)
  })

  it('gives the same transform for the same time', () => {
    const spec = { enter: 'slide-left', exit: 'pop' } as const
    expect(textMotionTransform(spec, 120, DURATION)).toEqual(
      textMotionTransform(spec, 120, DURATION)
    )
  })
})

describe('describeText with motion', () => {
  it('moves the anchor for a slide and scales the box for a pop', () => {
    const slid = describeText({ ...createTextItem('Hi'), enter: 'slide-left' }, 0, DURATION, canvas)
    expect(slid?.centerX).toBeCloseTo((0.5 - TEXT_SLIDE_FRACTION) * CANVAS_WIDTH)
    const rest = describeText({ ...createTextItem('Hi'), enter: 'pop' }, 0, DURATION, canvas)
    expect(rest?.motionScale).toBeCloseTo(0)
    expect(rest?.boxWidthPx).toBeCloseTo(0)
    const full = describeText({ ...createTextItem('Hi'), enter: 'pop' }, M, DURATION, canvas)
    expect(full?.motionScale).toBeCloseTo(1)
  })

  it('shows the first letters for a typewriter and keeps line breaks', () => {
    const item = { ...createTextItem('Hello world'), enter: 'typewriter' as const }
    expect(describeText(item, 0, DURATION, canvas)).toBeNull()
    expect(describeText(item, M / 2, DURATION, canvas)?.lines).toEqual(['Hello'])
    expect(describeText(item, M, DURATION, canvas)?.lines).toEqual(['Hello world'])
  })
})

describe('revealLines', () => {
  it('cuts across lines by letter count', () => {
    expect(revealLines(['abc', 'de'], 0.8)).toEqual(['abc', 'd'])
    expect(revealLines(['abc', 'de'], 1)).toEqual(['abc', 'de'])
    expect(revealLines(['abc'], 0)).toEqual([])
  })
})

describe('withMotionMs and motion schema', () => {
  it('clamps and rounds the motion length', () => {
    expect(withMotionMs(createTextItem('Hi'), 5).motionMs).toBe(100)
    expect(withMotionMs(createTextItem('Hi'), 9999).motionMs).toBe(2000)
    expect(withMotionMs(createTextItem('Hi'), 333.4).motionMs).toBe(333)
  })

  it('accepts every motion and rejects unknown ones and out-of-range lengths', () => {
    const base = createTextItem('Hi')
    for (const motion of ['slide-top', 'pop', 'typewriter', 'slide-left']) {
      expect(textItemSchema.safeParse({ ...base, enter: motion, exit: motion }).success).toBe(true)
    }
    expect(textItemSchema.safeParse({ ...base, enter: 'spin' }).success).toBe(false)
    expect(textItemSchema.safeParse({ ...base, motionMs: 50 }).success).toBe(false)
    expect(textItemSchema.safeParse({ ...base, motionMs: 400 }).success).toBe(true)
  })

  it('does not match a preset once the motion length is set by hand', () => {
    const preset = matchTextPreset({
      ...createTextItem('Hi'),
      styleId: 'display',
      scale: 1,
      enter: 'fade',
      exit: 'fade'
    })
    expect(preset).toBe('title-card')
    expect(
      matchTextPreset({
        ...createTextItem('Hi'),
        styleId: 'display',
        scale: 1,
        enter: 'fade',
        exit: 'fade',
        motionMs: 400
      })
    ).toBeNull()
  })
})
