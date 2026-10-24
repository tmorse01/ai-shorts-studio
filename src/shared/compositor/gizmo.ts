// Pure geometry for the preview canvas gizmo (Epic 06, #80): hit tests, drag maths, snapping and
// keyboard nudges. Everything is in canvas pixels (1080 x 1920). No DOM, no store: the renderer turns
// pointer positions into canvas points, applies the results, and records each drag as one command.
import type { Transform } from '../timeline/timeline'
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Placement } from './frame'

export interface Point {
  x: number
  y: number
}

export type Handle = 'nw' | 'ne' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw']

export const MIN_SCALE = 0.05
export const MAX_SCALE = 10
export const MIN_STRETCH = 0.2
export const MAX_STRETCH = 5

// The safe zone: 5% in from the sides and 10% in from the top and bottom. Layers snap to its edges.
export const SAFE_ZONE = {
  left: CANVAS_WIDTH * 0.05,
  right: CANVAS_WIDTH * 0.95,
  top: CANVAS_HEIGHT * 0.1,
  bottom: CANVAS_HEIGHT * 0.9
}
const SAFE_HALF_WIDTH = (SAFE_ZONE.right - SAFE_ZONE.left) / 2
const SAFE_HALF_HEIGHT = (SAFE_ZONE.bottom - SAFE_ZONE.top) / 2

// How close, in canvas pixels, an edge or centre must be to a snap line to lock onto it.
export const SNAP_DISTANCE_PX = 8

// Arrow-key nudges, in canvas pixels. Shift makes a bigger step.
export const NUDGE_PX = 1
export const NUDGE_SHIFT_PX = 10

// Snap lines to draw, as canvas coordinates: x lines are vertical, y lines horizontal.
export interface Guides {
  x: number[]
  y: number[]
}
export const NO_GUIDES: Guides = { x: [], y: [] }

export type GizmoHit = { kind: 'move' } | { kind: 'scale'; handle: Handle }

// A rectangle on the screen where the canvas is drawn, used to convert pointer positions.
export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

export type NudgeDirection = 'left' | 'right' | 'up' | 'down'

// A drag in progress. It holds what the layer looked like when the drag started, so every move
// computes from the same start and a drag that folds into one command ends where it should.
export type DragSession =
  | { kind: 'move'; start: Transform; startPlacement: Placement; origin: Point }
  | { kind: 'scale'; handle: Handle; start: Transform; startPlacement: Placement }

export interface DragResult {
  transform: Transform
  guides: Guides
}

// Rotates a point about an origin, in the same sense as the canvas 2D context (y points down).
function rotate(point: Point, origin: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// The four corners of a placed layer on the canvas, after its rotation.
export function cornersOf(placement: Placement): Record<Handle, Point> {
  const centre = { x: placement.centerX, y: placement.centerY }
  const hw = placement.width / 2
  const hh = placement.height / 2
  const at = (dx: number, dy: number) =>
    rotate({ x: centre.x + dx, y: centre.y + dy }, centre, placement.rotationDeg)
  return { nw: at(-hw, -hh), ne: at(hw, -hh), se: at(hw, hh), sw: at(-hw, hh) }
}

// A point in the layer's own unrotated frame, measured from its centre.
export function toLocal(point: Point, placement: Placement): Point {
  const centre = { x: placement.centerX, y: placement.centerY }
  const unrotated = rotate(point, centre, -placement.rotationDeg)
  return { x: unrotated.x - centre.x, y: unrotated.y - centre.y }
}

// True when a point falls inside the layer, rotation included.
export function containsPoint(point: Point, placement: Placement): boolean {
  const local = toLocal(point, placement)
  return Math.abs(local.x) <= placement.width / 2 && Math.abs(local.y) <= placement.height / 2
}

// What a press on a selected layer grabs: a corner handle first, then the body (a move).
export function hitTest(
  point: Point,
  placement: Placement,
  handleRadiusPx: number
): GizmoHit | null {
  const corners = cornersOf(placement)
  for (const handle of HANDLES) {
    if (distance(point, corners[handle]) <= handleRadiusPx) return { kind: 'scale', handle }
  }
  return containsPoint(point, placement) ? { kind: 'move' } : null
}

// The topmost layer under a point. Layers come in draw order, so the last match is on top.
export function pickLayer<T extends { placement: Placement }>(
  point: Point,
  layers: readonly T[]
): T | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (containsPoint(point, layers[index].placement)) return layers[index]
  }
  return null
}

// Converts a point on the screen to canvas pixels, given where the canvas is drawn.
export function toCanvasPoint(clientX: number, clientY: number, rect: ScreenRect): Point {
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  }
}

// A screen distance in canvas pixels, for hit radii that stay the same size on screen.
export function screenToCanvasPx(px: number, rect: ScreenRect): number {
  return (px * CANVAS_WIDTH) / rect.width
}

export function moveTransform(start: Transform, dx: number, dy: number): Transform {
  return { ...start, x: start.x + dx, y: start.y + dy }
}

// Snaps one axis: the nearest feature (start, centre or end of the box) to the nearest target, when
// it is within the snap distance. Returns the shift to apply and the target it locked onto.
function snapAxis(
  features: number[],
  targets: number[],
  threshold: number
): { shift: number; guide: number | null } {
  let best: { shift: number; guide: number } | null = null
  for (const feature of features) {
    for (const target of targets) {
      const shift = target - feature
      if (
        Math.abs(shift) <= threshold &&
        (best === null || Math.abs(shift) < Math.abs(best.shift))
      ) {
        best = { shift, guide: target }
      }
    }
  }
  return best ?? { shift: 0, guide: null }
}

// Snaps a moved box so its edges and centre line up with the canvas centre and the safe zone.
export function snapBox(
  box: Placement,
  threshold: number = SNAP_DISTANCE_PX
): { dx: number; dy: number; guides: Guides } {
  const left = box.centerX - box.width / 2
  const top = box.centerY - box.height / 2
  const x = snapAxis(
    [left, box.centerX, left + box.width],
    [SAFE_ZONE.left, CANVAS_WIDTH / 2, SAFE_ZONE.right],
    threshold
  )
  const y = snapAxis(
    [top, box.centerY, top + box.height],
    [SAFE_ZONE.top, CANVAS_HEIGHT / 2, SAFE_ZONE.bottom],
    threshold
  )
  return {
    dx: x.shift,
    dy: y.shift,
    guides: { x: x.guide === null ? [] : [x.guide], y: y.guide === null ? [] : [y.guide] }
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

// Moves a layer by the pointer's travel, snapped to the centre and the safe zone.
function moveDrag(session: Extract<DragSession, { kind: 'move' }>, pointer: Point): DragResult {
  const dx = pointer.x - session.origin.x
  const dy = pointer.y - session.origin.y
  const snap = snapBox({
    ...session.startPlacement,
    centerX: session.startPlacement.centerX + dx,
    centerY: session.startPlacement.centerY + dy
  })
  return {
    transform: moveTransform(session.start, dx + snap.dx, dy + snap.dy),
    guides: snap.guides
  }
}

// Scales a layer about its centre. The dragged corner follows the pointer. Uniform keeps the aspect
// ratio. Free (Shift) scales width and height separately, through the stretch field. Half sizes snap
// to the safe zone edges.
function scaleDrag(
  session: Extract<DragSession, { kind: 'scale' }>,
  pointer: Point,
  free: boolean
): DragResult {
  const { start, startPlacement } = session
  const hw = startPlacement.width / 2
  const hh = startPlacement.height / 2
  if (hw <= 0 || hh <= 0) return { transform: start, guides: NO_GUIDES }

  const local = toLocal(pointer, startPlacement)
  const guides: Guides = { x: [], y: [] }
  if (!free) {
    let factor = Math.hypot(local.x, local.y) / Math.hypot(hw, hh)
    if (Math.abs(hw * factor - SAFE_HALF_WIDTH) <= SNAP_DISTANCE_PX) {
      factor = SAFE_HALF_WIDTH / hw
      guides.x = [SAFE_ZONE.left, SAFE_ZONE.right]
    } else if (Math.abs(hh * factor - SAFE_HALF_HEIGHT) <= SNAP_DISTANCE_PX) {
      factor = SAFE_HALF_HEIGHT / hh
      guides.y = [SAFE_ZONE.top, SAFE_ZONE.bottom]
    }
    return {
      transform: { ...start, scale: clamp(start.scale * factor, MIN_SCALE, MAX_SCALE) },
      guides
    }
  }

  let fx = Math.max(Math.abs(local.x) / hw, 1e-3)
  let fy = Math.max(Math.abs(local.y) / hh, 1e-3)
  if (Math.abs(hw * fx - SAFE_HALF_WIDTH) <= SNAP_DISTANCE_PX) {
    fx = SAFE_HALF_WIDTH / hw
    guides.x = [SAFE_ZONE.left, SAFE_ZONE.right]
  }
  if (Math.abs(hh * fy - SAFE_HALF_HEIGHT) <= SNAP_DISTANCE_PX) {
    fy = SAFE_HALF_HEIGHT / hh
    guides.y = [SAFE_ZONE.top, SAFE_ZONE.bottom]
  }
  return {
    transform: {
      ...start,
      scale: clamp(start.scale * fx, MIN_SCALE, MAX_SCALE),
      stretch: clamp(((start.stretch ?? 1) * fy) / fx, MIN_STRETCH, MAX_STRETCH)
    },
    guides
  }
}

// The transform for the pointer's position during a drag. Shift makes a corner drag free.
export function dragTransform(session: DragSession, pointer: Point, shift: boolean): DragResult {
  return session.kind === 'move' ? moveDrag(session, pointer) : scaleDrag(session, pointer, shift)
}

// The offset for one arrow-key press.
export function nudgeOffset(direction: NudgeDirection, shift: boolean): Point {
  const step = shift ? NUDGE_SHIFT_PX : NUDGE_PX
  switch (direction) {
    case 'left':
      return { x: -step, y: 0 }
    case 'right':
      return { x: step, y: 0 }
    case 'up':
      return { x: 0, y: -step }
    case 'down':
      return { x: 0, y: step }
  }
}
