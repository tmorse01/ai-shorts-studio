import { describe, expect, it } from 'vitest'
import { curveExpression, curveKeys, imageOverlayMotion } from '@shared/render/motionExpressions'
import type { Clip } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

describe('curveKeys', () => {
  it('keeps the ends and the samples where the value changes, dropping flat runs', () => {
    const keys = curveKeys([
      { ms: 0, value: 0 },
      { ms: 100, value: 0 },
      { ms: 200, value: 0 },
      { ms: 300, value: 1 },
      { ms: 400, value: 1 },
      { ms: 500, value: 1 }
    ])
    expect(keys.map((key) => key.ms)).toEqual([0, 200, 300, 500])
  })
})

describe('curveExpression', () => {
  it('writes a linear ramp between two keys, held at the ends', () => {
    expect(
      curveExpression([
        { ms: 0, value: 0 },
        { ms: 1000, value: 1 }
      ])
    ).toBe('if(lt(t,0),0,if(lt(t,1),(0+(1)*(t-0)/1),1))')
  })

  it('uses the T variable when asked, for geq', () => {
    expect(
      curveExpression(
        [
          { ms: 0, value: 0 },
          { ms: 500, value: 1 }
        ],
        'T'
      )
    ).toBe('if(lt(T,0),0,if(lt(T,0.5),(0+(1)*(T-0)/0.5),1))')
  })
})

describe('imageOverlayMotion', () => {
  const imageClip = (imageItem: NonNullable<Clip['imageItem']>): Clip => ({
    id: 'i1',
    mediaId: 'logo',
    startMs: 1000,
    durationMs: 2000,
    sourceInMs: 0,
    transform: IDENTITY,
    imageItem
  })

  it('has no motion for a clip without an image item', () => {
    const clip: Clip = { id: 'v', startMs: 0, durationMs: 1000, sourceInMs: 0, transform: IDENTITY }
    expect(imageOverlayMotion(clip, null, 30)).toBeNull()
  })

  it('holds a static image at its placement with no alpha expression', () => {
    // A 400 x 400 source fits the 1080 x 1920 canvas at 1080 x 1080, centred at (540, 960).
    const motion = imageOverlayMotion(imageClip({}), { width: 400, height: 400 }, 30)
    expect(motion?.alpha).toBeNull()
    expect(motion?.centreX).toBe('if(lt(t,1),540,if(lt(t,3),(540+(0)*(t-1)/2),540))')
    expect(motion?.centreY).toBe('if(lt(t,1),960,if(lt(t,3),(960+(0)*(t-1)/2),960))')
  })

  it('fades a picture with an enter motion through a per-frame alpha expression in T', () => {
    const motion = imageOverlayMotion(imageClip({ enter: 'fade', motionMs: 250 }), null, 30)
    expect(motion?.alpha).not.toBeNull()
    expect(motion?.alpha).toContain('T')
    // The enter starts hidden, at the clip's start time.
    expect(motion?.alpha?.startsWith('if(lt(T,1),0,')).toBe(true)
  })

  it('slides a picture in from the side with a centre that changes per frame', () => {
    const motion = imageOverlayMotion(imageClip({ enter: 'slide-left', motionMs: 250 }), null, 30)
    expect(motion?.centreX).toContain('(t-1)')
    // A slide also fades in, so its alpha moves too.
    expect(motion?.alpha).not.toBeNull()
  })
})
