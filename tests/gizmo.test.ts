import { describe, expect, it } from 'vitest'
import type { Placement } from '@shared/compositor/frame'
import {
  cornersOf,
  dragTransform,
  hitTest,
  MAX_SCALE,
  MIN_SCALE,
  nudgeOffset,
  pickLayer,
  SAFE_ZONE,
  screenToCanvasPx,
  snapBox,
  toCanvasPoint,
  toLocal,
  containsPoint,
  type DragSession
} from '@shared/compositor/gizmo'
import { IDENTITY_TRANSFORM, type Transform } from '@shared/timeline/timeline'

// A 400 x 300 layer centred on the canvas, unrotated.
const BOX: Placement = { centerX: 540, centerY: 960, width: 400, height: 300, rotationDeg: 0 }

describe('gizmo geometry', () => {
  it('finds the corners of an unrotated layer', () => {
    const corners = cornersOf(BOX)
    expect(corners.nw).toEqual({ x: 340, y: 810 })
    expect(corners.se).toEqual({ x: 740, y: 1110 })
  })

  it('rotates the corners and the hit test with the layer', () => {
    const rotated: Placement = { ...BOX, rotationDeg: 90 }
    // Rotated a quarter turn, the 400-wide layer runs up and down the canvas.
    expect(containsPoint({ x: 540, y: 960 + 190 }, rotated)).toBe(true)
    expect(containsPoint({ x: 540, y: 960 + 250 }, rotated)).toBe(false)
    const local = toLocal({ x: 540, y: 960 + 190 }, rotated)
    expect(local.x).toBeCloseTo(190)
    expect(local.y).toBeCloseTo(0)
  })

  it('hits a corner handle before the body, and misses outside the layer', () => {
    expect(hitTest({ x: 342, y: 808 }, BOX, 12)).toEqual({ kind: 'scale', handle: 'nw' })
    expect(hitTest({ x: 540, y: 960 }, BOX, 12)).toEqual({ kind: 'move' })
    expect(hitTest({ x: 10, y: 10 }, BOX, 12)).toBeNull()
  })

  it('picks the topmost layer under a point', () => {
    const below = { id: 'below', placement: BOX }
    const above = { id: 'above', placement: { ...BOX, width: 200, height: 200 } }
    expect(pickLayer({ x: 540, y: 960 }, [below, above])?.id).toBe('above')
    expect(pickLayer({ x: 380, y: 960 }, [below, above])?.id).toBe('below')
    expect(pickLayer({ x: 10, y: 10 }, [below, above])).toBeNull()
  })

  it('converts screen points to canvas pixels', () => {
    const rect = { left: 100, top: 50, width: 270, height: 480 }
    expect(toCanvasPoint(100, 50, rect)).toEqual({ x: 0, y: 0 })
    expect(toCanvasPoint(370, 530, rect)).toEqual({ x: 1080, y: 1920 })
    expect(toCanvasPoint(235, 290, rect)).toEqual({ x: 540, y: 960 })
    expect(screenToCanvasPx(12, rect)).toBeCloseTo(48)
  })
})

describe('snapping', () => {
  it('snaps the centre to the canvas centre within the snap distance', () => {
    const snapped = snapBox({ ...BOX, centerX: 545 })
    expect(snapped.dx).toBe(-5)
    expect(snapped.guides.x).toEqual([540])
    // The box is already centred vertically, so that line is shown as an alignment guide too.
    expect(snapped.guides.y).toEqual([960])
  })

  it('snaps an edge to the safe zone', () => {
    const snapped = snapBox({ ...BOX, centerX: 257 })
    expect(snapped.dx).toBe(-3)
    expect(snapped.guides.x).toEqual([SAFE_ZONE.left])
  })

  it('leaves a box alone when nothing is near a snap line', () => {
    const snapped = snapBox({ ...BOX, centerX: 600, centerY: 1000 })
    expect(snapped).toEqual({ dx: 0, dy: 0, guides: { x: [], y: [] } })
  })
})

describe('drag maths', () => {
  const moveSession: DragSession = {
    kind: 'move',
    start: IDENTITY_TRANSFORM,
    startPlacement: BOX,
    origin: { x: 540, y: 960 }
  }

  it('moves a layer by the pointer travel', () => {
    const result = dragTransform(moveSession, { x: 600, y: 1000 }, false)
    expect(result.transform.x).toBe(60)
    expect(result.transform.y).toBe(40)
  })

  it('moves a layer onto the snap line and reports the guide', () => {
    const result = dragTransform(moveSession, { x: 545, y: 960 }, false)
    expect(result.transform.x).toBe(0)
    expect(result.guides.x).toEqual([540])
  })

  it('scales about the centre and keeps the aspect ratio by default', () => {
    const session: DragSession = {
      kind: 'scale',
      handle: 'se',
      start: IDENTITY_TRANSFORM,
      startPlacement: BOX
    }
    // The corner is twice as far from the centre, along the diagonal.
    const result = dragTransform(session, { x: 940, y: 1260 }, false)
    expect(result.transform.scale).toBeCloseTo(2)
    expect(result.transform.stretch).toBeUndefined()
  })

  it('snaps a scaled half-width to the safe zone edge', () => {
    const session: DragSession = {
      kind: 'scale',
      handle: 'se',
      start: IDENTITY_TRANSFORM,
      startPlacement: BOX
    }
    const result = dragTransform(session, { x: 1020, y: 1320 }, false)
    expect(result.transform.scale).toBeCloseTo((SAFE_ZONE.right - SAFE_ZONE.left) / 2 / 200)
    expect(result.guides.x).toEqual([SAFE_ZONE.left, SAFE_ZONE.right])
  })

  it('stretches width and height separately when Shift is held', () => {
    const session: DragSession = {
      kind: 'scale',
      handle: 'se',
      start: IDENTITY_TRANSFORM,
      startPlacement: BOX
    }
    const result = dragTransform(session, { x: 940, y: 1110 }, true)
    expect(result.transform.scale).toBeCloseTo(2)
    expect(result.transform.stretch).toBeCloseTo(0.5)
  })

  it('clamps a scale so a layer cannot vanish or blow up', () => {
    const session: DragSession = {
      kind: 'scale',
      handle: 'se',
      start: IDENTITY_TRANSFORM,
      startPlacement: BOX
    }
    const shrunk = dragTransform(session, { x: 541, y: 961 }, false)
    expect(shrunk.transform.scale).toBe(MIN_SCALE)
    const grown = dragTransform(session, { x: 540 + 250 * 100, y: 960 + 250 * 100 }, false)
    expect(grown.transform.scale).toBe(MAX_SCALE)
  })

  it('reads from the start transform, so repeated moves do not compound', () => {
    const start: Transform = { x: 100, y: 0, scale: 1, rotationDeg: 0 }
    const session: DragSession = { ...moveSession, start }
    const first = dragTransform(session, { x: 610, y: 960 }, false)
    const again = dragTransform(session, { x: 610, y: 960 }, false)
    expect(again.transform).toEqual(first.transform)
    expect(first.transform.x).toBe(170)
  })
})

describe('nudges', () => {
  it('moves one canvas pixel per press, ten with Shift', () => {
    expect(nudgeOffset('left', false)).toEqual({ x: -1, y: 0 })
    expect(nudgeOffset('right', true)).toEqual({ x: 10, y: 0 })
    expect(nudgeOffset('up', false)).toEqual({ x: 0, y: -1 })
    expect(nudgeOffset('down', true)).toEqual({ x: 0, y: 10 })
  })
})
