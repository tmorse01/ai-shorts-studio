// Per-clip framing for a vertical short (Epic 09, #102). A clip either crops a zoomed region of its
// source to fill the output frame ('fill'), or shows the whole source over a blurred copy ('blurFit').
// Pure maths and zod schemas, shared by main and the renderer. The resolver in ./resolveFrame.ts
// calls resolveFramingAt to get the pose at a time.
import { z } from 'zod'

export const framingModeSchema = z.enum(['fill', 'blurFit'])
export type FramingMode = z.infer<typeof framingModeSchema>

// Zoom limits. 1 is the largest crop that still fills the output frame (the "cover" crop), so the
// crop can never be bigger than the source. MAX_FRAMING_SCALE is the closest zoom-in.
export const MIN_FRAMING_SCALE = 1
export const MAX_FRAMING_SCALE = 4

// Where the crop sits. x and y are the crop centre as a fraction of the room it has to move in:
// -1 puts the crop against the left or top edge of the source, 1 against the right or bottom edge,
// 0 centres it. Values outside [-1, 1] are clamped, so the crop never leaves the source.
export const framingPoseSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number().min(MIN_FRAMING_SCALE).max(MAX_FRAMING_SCALE)
})
export type FramingPose = z.infer<typeof framingPoseSchema>

export const clipFramingSchema = framingPoseSchema.extend({
  mode: framingModeSchema,
  // Where the pan ends. Unset means the pose holds for the whole clip.
  panTo: framingPoseSchema.optional()
})
export type ClipFraming = z.infer<typeof clipFramingSchema>

export const CENTRE_FRAMING: FramingPose = { x: 0, y: 0, scale: MIN_FRAMING_SCALE }

export function clampFramingScale(scale: number): number {
  if (Number.isNaN(scale)) return MIN_FRAMING_SCALE
  return Math.min(MAX_FRAMING_SCALE, Math.max(MIN_FRAMING_SCALE, scale))
}

export function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(-1, value))
}

// A rectangle in source pixels.
export type SourceRect = { x: number; y: number; width: number; height: number }

// The crop that fills the output frame at scale 1: the biggest rectangle of the output's aspect ratio
// that fits inside the source, centred.
export function coverCropSize(
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number
): { width: number; height: number } {
  const outAspect = outWidth / outHeight
  const sourceAspect = sourceWidth / sourceHeight
  if (sourceAspect > outAspect) {
    return { width: sourceHeight * outAspect, height: sourceHeight }
  }
  return { width: sourceWidth, height: sourceWidth / outAspect }
}

// The source rectangle to show for a framing pose. In 'fill' mode the crop is the cover crop divided
// by the zoom, placed by x and y, and kept inside the source. In 'blurFit' mode the whole source is
// shown, so the rectangle is the full source.
export function framingCropRect(
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number,
  framing: { mode: FramingMode } & FramingPose
): SourceRect {
  if (framing.mode === 'blurFit') {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
  }
  const cover = coverCropSize(sourceWidth, sourceHeight, outWidth, outHeight)
  const scale = clampFramingScale(framing.scale)
  const width = cover.width / scale
  const height = cover.height / scale
  const roomX = (sourceWidth - width) / 2
  const roomY = (sourceHeight - height) / 2
  const x = roomX + clampUnit(framing.x) * roomX
  const y = roomY + clampUnit(framing.y) * roomY
  return { x, y, width, height }
}

// Ease in and out. Maps 0 to 0, 1 to 1, and starts and ends with zero speed.
export function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

// Linear interpolation between two numbers, with `t` in [0, 1].
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

// The pose at a point in the pan: `progress` is 0 at the start and 1 at the end, eased.
export function interpolatePose(from: FramingPose, to: FramingPose, progress: number): FramingPose {
  const t = easeInOut(progress)
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    scale: lerp(from.scale, to.scale, t)
  }
}

// How far through a clip a time is, from 0 at its start to 1 at its end.
export function clipProgress(startMs: number, durationMs: number, tMs: number): number {
  if (durationMs <= 0) return 1
  return Math.min(1, Math.max(0, (tMs - startMs) / durationMs))
}

// The framing at a time in a clip. The pose starts at x, y and scale, and eases to panTo across the
// whole clip. Without panTo it holds. The result always has limits applied.
export function resolveFramingAt(
  framing: ClipFraming,
  startMs: number,
  durationMs: number,
  tMs: number
): { mode: FramingMode } & FramingPose {
  const start: FramingPose = {
    x: clampUnit(framing.x),
    y: clampUnit(framing.y),
    scale: clampFramingScale(framing.scale)
  }
  const end = framing.panTo
    ? {
        x: clampUnit(framing.panTo.x),
        y: clampUnit(framing.panTo.y),
        scale: clampFramingScale(framing.panTo.scale)
      }
    : start
  const pose = interpolatePose(start, end, clipProgress(startMs, durationMs, tMs))
  return { mode: framing.mode, ...pose }
}

// The framing a clip starts with when it has none: a centred fill at the cover crop.
export const CENTRED_FILL: ClipFraming = { mode: 'fill', x: 0, y: 0, scale: MIN_FRAMING_SCALE }

// The framing for a new cut from a source: the last framing used on that source, or a centred fill
// when none was used yet. The copy keeps the pan, so a new cut matches the last one exactly.
export function framingForNewCut(last: ClipFraming | undefined): ClipFraming {
  return last ? { ...last, panTo: last.panTo ? { ...last.panTo } : undefined } : { ...CENTRED_FILL }
}

// A gesture on the canvas, as the gizmo measures it: how far the layer moved in canvas pixels, and
// how much it scaled (1 is no change).
export interface FramingGesture {
  dxCanvas: number
  dyCanvas: number
  scaleFactor: number
}

// The framing pose after a gesture on a fill-mode clip. Moving the layer right moves the crop left,
// so the crop follows the content. Scaling up zooms in. The result is clamped to the source: the
// crop never leaves it, and the zoom stays within its limits. Pure, so a drag computes from the
// pose it started with.
export function framingAfterGesture(
  start: FramingPose,
  gesture: FramingGesture,
  source: { width: number; height: number },
  out: { width: number; height: number }
): FramingPose {
  const scale = clampFramingScale(start.scale)
  const cover = coverCropSize(source.width, source.height, out.width, out.height)
  const cropWidth = cover.width / scale
  // Canvas pixels per source pixel in the framed view.
  const perSource = out.width / cropWidth
  const roomX = (source.width - cropWidth) / 2
  const roomY = (source.height - cover.height / scale) / 2
  const moveX = roomX > 0 ? -gesture.dxCanvas / perSource / roomX : 0
  const moveY = roomY > 0 ? -gesture.dyCanvas / perSource / roomY : 0
  return {
    x: clampUnit(start.x + moveX),
    y: clampUnit(start.y + moveY),
    scale: clampFramingScale(scale * gesture.scaleFactor)
  }
}
