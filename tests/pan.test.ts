import { describe, expect, it } from 'vitest'
import { framingOutlines, placeTransform } from '@shared/compositor/frame'
import {
  clearPan,
  clipFramingSchema,
  easeProgress,
  easeInOut,
  interpolatePose,
  poseOf,
  resetFraming,
  resolveFramingAt,
  setEndFraming,
  withPose,
  type ClipFraming
} from '@shared/timeline/framing'
import { updateClipFraming } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'
import { framingClipFor } from '@renderer/features/compositor/panTarget'
import { createHistoryStore, type Command } from '@renderer/features/history/historyStore'

const LANDSCAPE = { width: 1920, height: 1080 }

const PANNED: ClipFraming = {
  mode: 'fill',
  x: -1,
  y: 0,
  scale: 1,
  panTo: { x: 1, y: 0.5, scale: 2 }
}

function timelineWith(framing?: ClipFraming): Timeline {
  return {
    tracks: [
      {
        id: 't1',
        kind: 'video',
        role: 'main',
        muted: false,
        clips: [
          {
            id: 'c1',
            mediaId: 'm1',
            startMs: 0,
            durationMs: 1000,
            sourceInMs: 0,
            transform: { ...IDENTITY_TRANSFORM },
            framing
          }
        ]
      }
    ]
  }
}

describe('ease curves', () => {
  it('linear progress is the clamped progress itself', () => {
    expect(easeProgress(0.25, 'linear')).toBe(0.25)
    expect(easeProgress(-1, 'linear')).toBe(0)
    expect(easeProgress(2, 'linear')).toBe(1)
  })

  it('ease in-out matches easeInOut and is the default', () => {
    expect(easeProgress(0.25, 'easeInOut')).toBeCloseTo(easeInOut(0.25))
    expect(easeProgress(0.25)).toBeCloseTo(easeInOut(0.25))
  })

  it('linear pans move at a constant rate across the clip', () => {
    const from = { x: -1, y: 0, scale: 1 }
    const to = { x: 1, y: 0.5, scale: 2 }
    expect(interpolatePose(from, to, 0.25, 'linear')).toEqual({ x: -0.5, y: 0.125, scale: 1.25 })
  })

  it('resolveFramingAt uses the clip ease, and the default when unset', () => {
    const linear = resolveFramingAt({ ...PANNED, ease: 'linear' }, 0, 1000, 250)
    expect(linear.x).toBeCloseTo(-0.5)
    const eased = resolveFramingAt(PANNED, 0, 1000, 250)
    expect(eased.x).toBeCloseTo(-0.6875)
  })
})

describe('framing schema', () => {
  it('accepts a known ease and rejects an unknown one', () => {
    expect(clipFramingSchema.safeParse({ ...PANNED, ease: 'linear' }).success).toBe(true)
    expect(clipFramingSchema.safeParse({ ...PANNED, ease: 'bounce' }).success).toBe(false)
  })

  it('keeps framings saved before the ease existed valid', () => {
    expect(clipFramingSchema.safeParse(PANNED).success).toBe(true)
  })
})

describe('pan poses', () => {
  it('reads the start pose, or the end pose when asked for it and the clip has a pan', () => {
    expect(poseOf(PANNED, 'start')).toEqual({ x: -1, y: 0, scale: 1 })
    expect(poseOf(PANNED, 'end')).toEqual({ x: 1, y: 0.5, scale: 2 })
    expect(poseOf({ ...PANNED, panTo: undefined }, 'end')).toEqual({ x: -1, y: 0, scale: 1 })
  })

  it('replaces the pose that is being edited and keeps the other one', () => {
    const endEdited = withPose(PANNED, 'end', { x: 0, y: 0, scale: 3 })
    expect(endEdited.panTo).toEqual({ x: 0, y: 0, scale: 3 })
    expect(endEdited.x).toBe(-1)
    const startEdited = withPose(PANNED, 'start', { x: 0.5, y: 0, scale: 1 })
    expect(startEdited.x).toBe(0.5)
    expect(startEdited.panTo).toEqual(PANNED.panTo)
  })

  it('sets the end framing to the current framing, keeping the ease', () => {
    const framing: ClipFraming = { mode: 'fill', x: 0.5, y: -0.5, scale: 2, ease: 'linear' }
    expect(setEndFraming(framing)).toEqual({ ...framing, panTo: { x: 0.5, y: -0.5, scale: 2 } })
  })

  it('clears the pan and its ease, and leaves the start pose', () => {
    expect(clearPan({ ...PANNED, ease: 'linear' })).toEqual({
      mode: 'fill',
      x: -1,
      y: 0,
      scale: 1
    })
  })
})

describe('pan edits on the timeline', () => {
  it('captures the framing as the end, then clears it', () => {
    const start = timelineWith({ mode: 'fill', x: 0.25, y: 0, scale: 1.5 })
    const panned = updateClipFraming(start, 'c1', setEndFraming)
    expect(panned.tracks[0].clips[0].framing?.panTo).toEqual({ x: 0.25, y: 0, scale: 1.5 })
    const cleared = updateClipFraming(panned, 'c1', clearPan)
    expect(cleared.tracks[0].clips[0].framing).toEqual({ mode: 'fill', x: 0.25, y: 0, scale: 1.5 })
  })

  it('undoes a set end framing as one history step', () => {
    type Doc = { timeline: Timeline }
    const initial: Doc = { timeline: timelineWith({ mode: 'fill', x: 0, y: 0, scale: 1 }) }
    const history = createHistoryStore<Doc>(initial)
    const setEnd: Command<Doc> = {
      label: 'Set end framing',
      produce: (draft) => {
        draft.timeline = updateClipFraming(draft.timeline, 'c1', setEndFraming)
      }
    }
    history.getState().execute(setEnd)
    expect(history.getState().present.timeline.tracks[0].clips[0].framing?.panTo).toBeDefined()
    history.getState().undo()
    expect(history.getState().present.timeline.tracks[0].clips[0].framing?.panTo).toBeUndefined()
  })
})

describe('framingOutlines', () => {
  const base = placeTransform(IDENTITY_TRANSFORM, LANDSCAPE)

  it('shows the start crop centred for a centred framing, with no end outline', () => {
    const outlines = framingOutlines(LANDSCAPE, base, { mode: 'fill', x: 0, y: 0, scale: 1 })
    expect(outlines).not.toBeNull()
    expect(outlines?.start.centerX).toBeCloseTo(540)
    expect(outlines?.start.centerY).toBeCloseTo(960)
    expect(outlines?.start.width).toBeCloseTo(341.72, 1)
    expect(outlines?.start.height).toBeCloseTo(607.5, 1)
    expect(outlines?.end).toBeNull()
  })

  it('moves the start crop to the left edge of the source at x of -1', () => {
    const outlines = framingOutlines(LANDSCAPE, base, { ...PANNED, panTo: undefined })
    const leftEdge = base.centerX - base.width / 2
    const start = outlines!.start
    expect(start.centerX - start.width / 2).toBeCloseTo(leftEdge, 1)
  })

  it('draws an end outline when the clip has a pan', () => {
    const outlines = framingOutlines(LANDSCAPE, base, PANNED)
    expect(outlines?.end).not.toBeNull()
    // A zoom of 2 halves the crop, so the end outline is half the start outline's size.
    expect(outlines!.end!.width).toBeCloseTo(outlines!.start.width / 2, 1)
  })

  it('turns the outline with the layer rotation', () => {
    const rotated = framingOutlines(
      LANDSCAPE,
      { ...base, rotationDeg: 90 },
      { mode: 'fill', x: -1, y: 0, scale: 1 }
    )
    // The crop centre sits 369.14 px left of the layer centre before rotation. A quarter turn clockwise
    // (CSS rotate) moves it up, so the centre lands 369.14 px above the layer centre.
    expect(rotated?.start.centerX).toBeCloseTo(540, 3)
    expect(rotated?.start.centerY).toBeCloseTo(960 - 369.14, 1)
    expect(rotated?.start.rotationDeg).toBe(90)
  })

  it('has no outlines for a blur-fit clip or an unknown source size', () => {
    expect(framingOutlines(LANDSCAPE, base, { mode: 'blurFit', x: 0, y: 0, scale: 1 })).toBeNull()
    expect(framingOutlines({ width: 0, height: 0 }, base, PANNED)).toBeNull()
  })
})

describe('framingClipFor', () => {
  it('returns the one selected video clip, fill or blur-fit', () => {
    const timeline = timelineWith({ mode: 'fill', x: 0, y: 0, scale: 1 })
    expect(framingClipFor(timeline, ['c1'])?.id).toBe('c1')
    const blur = timelineWith({ mode: 'blurFit', x: 0, y: 0, scale: 1 })
    expect(framingClipFor(blur, ['c1'])?.id).toBe('c1')
  })

  it('treats a clip with no framing as a centred fill', () => {
    expect(framingClipFor(timelineWith(undefined), ['c1'])?.id).toBe('c1')
  })

  it('gives nothing for several clips, no selection or an unknown clip', () => {
    expect(framingClipFor(timelineWith(undefined), ['c1', 'c2'])).toBeNull()
    expect(framingClipFor(timelineWith(undefined), [])).toBeNull()
    expect(framingClipFor(timelineWith(undefined), ['missing'])).toBeNull()
  })
})

describe('resetFraming', () => {
  it('centres the crop at the cover zoom and removes the pan, keeping the mode', () => {
    const reset = resetFraming({ ...PANNED, mode: 'blurFit' })
    expect(reset).toEqual({ mode: 'blurFit', x: 0, y: 0, scale: 1 })
  })
})
