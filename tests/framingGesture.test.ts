import { describe, expect, it } from 'vitest'
import { describeFrame } from '@shared/compositor/frame'
import { CENTRED_FILL, framingAfterGesture, framingForNewCut } from '@shared/timeline/framing'
import { updateClipFraming, TimelineEditError } from '@shared/timeline/edits'
import { IDENTITY_TRANSFORM, type Timeline } from '@shared/timeline/timeline'
import { createHistoryStore, type Command } from '@renderer/features/history/historyStore'
import {
  rememberFraming,
  lastFramingFor,
  clearFramingMemory
} from '@renderer/features/compositor/framingMemory'

const OUT = { width: 1080, height: 1920 }
const LANDSCAPE = { width: 1920, height: 1080 }
const PORTRAIT = { width: 1080, height: 1920 }

function timelineWith(framing: Timeline['tracks'][number]['clips'][number]['framing']): Timeline {
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

describe('framingAfterGesture', () => {
  it('moves the crop against the content: dragging right pans the crop left', () => {
    const pose = framingAfterGesture(
      { x: 0, y: 0, scale: 1 },
      { dxCanvas: 10, dyCanvas: 0, scaleFactor: 1 },
      LANDSCAPE,
      OUT
    )
    expect(pose.x).toBeLessThan(0)
    expect(pose.y).toBe(0)
  })

  it('clamps the pan to the source edge', () => {
    // At scale 2 the landscape source has room to pan on both axes.
    const pose = framingAfterGesture(
      { x: 0, y: 0, scale: 2 },
      { dxCanvas: 100000, dyCanvas: -100000, scaleFactor: 1 },
      LANDSCAPE,
      OUT
    )
    expect(pose.x).toBe(-1)
    expect(pose.y).toBe(1)
  })

  it('does not pan when the source has no room on that axis', () => {
    const pose = framingAfterGesture(
      { x: 0, y: 0, scale: 1 },
      { dxCanvas: 500, dyCanvas: 0, scaleFactor: 1 },
      PORTRAIT,
      OUT
    )
    expect(pose.x).toBe(0)
  })

  it('scales the zoom and clamps it to its limits', () => {
    const zoomed = framingAfterGesture(
      { x: 0, y: 0, scale: 1 },
      { dxCanvas: 0, dyCanvas: 0, scaleFactor: 2 },
      LANDSCAPE,
      OUT
    )
    expect(zoomed.scale).toBe(2)
    const capped = framingAfterGesture(
      { x: 0, y: 0, scale: 1 },
      { dxCanvas: 0, dyCanvas: 0, scaleFactor: 100 },
      LANDSCAPE,
      OUT
    )
    expect(capped.scale).toBe(4)
    const floored = framingAfterGesture(
      { x: 0, y: 0, scale: 1 },
      { dxCanvas: 0, dyCanvas: 0, scaleFactor: 0.01 },
      LANDSCAPE,
      OUT
    )
    expect(floored.scale).toBe(1)
  })
})

describe('framingForNewCut', () => {
  it('starts a new cut from the last framing used on its source', () => {
    const last = { mode: 'fill' as const, x: 0.5, y: -0.25, scale: 2 }
    expect(framingForNewCut(last)).toEqual(last)
  })

  it('falls back to a centred fill when the source has no framing yet', () => {
    expect(framingForNewCut(undefined)).toEqual(CENTRED_FILL)
  })
})

describe('framing memory', () => {
  it('keeps the last framing per source', () => {
    clearFramingMemory()
    rememberFraming('m1', { mode: 'fill', x: 1, y: 0, scale: 2 })
    rememberFraming('m1', { mode: 'fill', x: -1, y: 0, scale: 3 })
    expect(lastFramingFor('m1')).toEqual({ mode: 'fill', x: -1, y: 0, scale: 3 })
    expect(lastFramingFor('m2')).toBeUndefined()
  })
})

describe('describeFrame with fill framing', () => {
  it('draws a centred fill at scale 1 as the full canvas for a portrait source', () => {
    const frame = describeFrame(
      timelineWith({ mode: 'fill', x: 0, y: 0, scale: 1 }),
      0,
      () => PORTRAIT
    )
    const [layer] = frame.layers
    expect(layer.placement).toEqual({
      centerX: 540,
      centerY: 960,
      width: 1080,
      height: 1920,
      rotationDeg: 0
    })
    expect(layer.source).toEqual(PORTRAIT)
  })

  it('zooms the crop: a scale of 2 makes the source twice the canvas width', () => {
    const frame = describeFrame(
      timelineWith({ mode: 'fill', x: 0, y: 0, scale: 2 }),
      0,
      () => PORTRAIT
    )
    expect(frame.layers[0].placement.width).toBe(2160)
    expect(frame.layers[0].placement.centerX).toBe(540)
  })

  it('puts the crop edges on the canvas edges when panned to the source edge', () => {
    const frame = describeFrame(
      timelineWith({ mode: 'fill', x: 1, y: 0, scale: 2 }),
      0,
      () => LANDSCAPE
    )
    const { placement } = frame.layers[0]
    const perSource = placement.width / LANDSCAPE.width
    const sourceLeft = placement.centerX - placement.width / 2
    // At scale 2 the crop is 303.75 source pixels wide. At x = 1 it ends at the source's right edge,
    // so its left edge is 1616.25 source pixels in.
    expect(sourceLeft + 1616.25 * perSource).toBeCloseTo(0, 6)
    expect(sourceLeft + LANDSCAPE.width * perSource).toBeCloseTo(1080, 6)
  })

  it('leaves a clip with no framing fitted as before', () => {
    const frame = describeFrame(timelineWith(undefined), 0, () => LANDSCAPE)
    expect(frame.layers[0].placement.width).toBe(1080)
    expect(frame.layers[0].source).toEqual(LANDSCAPE)
  })
})

describe('updateClipFraming', () => {
  it('stores the framing the update returns on the clip', () => {
    const next = updateClipFraming(timelineWith(undefined), 'c1', (framing) => ({
      ...framing,
      x: 0.5
    }))
    expect(next.tracks[0].clips[0].framing).toEqual({ ...CENTRED_FILL, x: 0.5 })
  })

  it('refuses a framing that does not match the schema', () => {
    expect(() =>
      updateClipFraming(timelineWith(undefined), 'c1', (framing) => ({
        ...framing,
        scale: Number.NaN
      }))
    ).toThrow(TimelineEditError)
  })
})

describe('history merge window per command', () => {
  interface Doc {
    count: number
  }
  const bump = (mergeWindowMs?: number): Command<Doc> => ({
    label: 'Move layer',
    mergeKey: 'gizmo:c1:1',
    mergeWindowMs,
    produce: (draft) => {
      draft.count += 1
    }
  })

  it('folds a drag that pauses past the default window into one step', () => {
    let clock = 0
    const history = createHistoryStore<Doc>({ count: 0 }, { now: () => clock })
    for (const at of [0, 800, 1600]) {
      clock = at
      history.getState().execute(bump(Number.POSITIVE_INFINITY))
    }
    expect(history.getState().past).toHaveLength(1)
    history.getState().undo()
    expect(history.getState().present.count).toBe(0)
  })

  it('still splits the same pauses when the command keeps the default window', () => {
    let clock = 0
    const history = createHistoryStore<Doc>({ count: 0 }, { now: () => clock })
    for (const at of [0, 800, 1600]) {
      clock = at
      history.getState().execute(bump())
    }
    expect(history.getState().past).toHaveLength(3)
  })
})
