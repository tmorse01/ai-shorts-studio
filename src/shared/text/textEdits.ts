// Pure rules for editing a text overlay's position and size (Epic 13, #127): the canvas gizmo moves and
// scales a text item as a fraction of the frame, and the nudge keys step it. No DOM, no store.
import type { TextItem } from './textItem'
import type { TextColorName } from './textStyles'
import { MAX_TEXT_MOTION_MS, MIN_TEXT_MOTION_MS } from './textMotion'

// The text scale range. The schema allows up to 4; the lower bound keeps the text legible on the frame.
export const MIN_TEXT_SCALE = 0.25
export const MAX_TEXT_SCALE = 4

export function clampTextScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_TEXT_SCALE), MAX_TEXT_SCALE)
}

function clampFraction(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

// The item with its centre at a point in canvas pixels. The fraction stays on the frame.
export function moveTextItem(
  item: TextItem,
  centreX: number,
  centreY: number,
  canvas: { width: number; height: number }
): TextItem {
  return {
    ...item,
    x: clampFraction(centreX / canvas.width),
    y: clampFraction(centreY / canvas.height)
  }
}

// The item moved by an offset in canvas pixels, for the arrow keys.
export function nudgeTextItem(
  item: TextItem,
  dxPx: number,
  dyPx: number,
  canvas: { width: number; height: number }
): TextItem {
  return moveTextItem(item, item.x * canvas.width + dxPx, item.y * canvas.height + dyPx, canvas)
}

// The item at a new scale, kept inside the text scale range.
export function scaleTextItem(item: TextItem, scale: number): TextItem {
  return { ...item, scale: clampTextScale(scale) }
}

// The item with its colour set, or with the style's colour when color is undefined.
export function withColor(item: TextItem, color: TextColorName | undefined): TextItem {
  const next: TextItem = { ...item }
  if (color === undefined) delete next.color
  else next.color = color
  return next
}

// The item with its motion length set, kept inside the motion range and rounded to whole ms.
export function withMotionMs(item: TextItem, ms: number): TextItem {
  const clamped = Math.round(Math.min(Math.max(ms, MIN_TEXT_MOTION_MS), MAX_TEXT_MOTION_MS))
  return { ...item, motionMs: clamped }
}

// The item with its backdrop set, or with no backdrop when backdrop is undefined.
export function withBackdrop(item: TextItem, backdrop: TextColorName | undefined): TextItem {
  const next: TextItem = { ...item }
  if (backdrop === undefined) delete next.backdrop
  else next.backdrop = backdrop
  return next
}
