// Entry and exit motions for text overlays (Epic 13, #128). Pure: no DOM, no store. The preview and export
// both call textMotionTransform, so a given clip time gives the same opacity, offset, scale and reveal in
// both. Offsets are fractions of the frame, so each consumer scales them to its own resolution.
import type { TextMotion, TextItem } from './textItem'

export const TEXT_MOTION_DEFAULT_MS = 250
export const MIN_TEXT_MOTION_MS = 100
export const MAX_TEXT_MOTION_MS = 2000

// How far a slide travels, as a fraction of the frame's width (sideways slides) or height (top and bottom).
export const TEXT_SLIDE_FRACTION = 0.2

export interface TextMotionTransform {
  // Opacity, 0 to 1.
  alpha: number
  // Offset from the item's rest position, as fractions of the frame width and height.
  dxFrac: number
  dyFrac: number
  // Multiplies the item's size. 1 at rest.
  scale: number
  // Share of the text shown, 0 to 1. Only the typewriter motion holds it below 1.
  reveal: number
}

export const TEXT_MOTION_REST: TextMotionTransform = {
  alpha: 1,
  dxFrac: 0,
  dyFrac: 0,
  scale: 1,
  reveal: 1
}

// The motion fields of a text item. A missing motionMs means the default length.
export type TextMotionSpec = Pick<TextItem, 'enter' | 'exit' | 'motionMs'>

// The transform of a text item at elapsedMs into its clip of durationMs. The entry runs from the clip's
// start and the exit runs up to its end, each for motionMs, or half the clip when the clip is shorter. The
// two never overlap.
export function textMotionTransform(
  spec: TextMotionSpec,
  elapsedMs: number,
  durationMs: number
): TextMotionTransform {
  const lengthMs = Math.min(spec.motionMs ?? TEXT_MOTION_DEFAULT_MS, durationMs / 2)
  if (lengthMs <= 0) return TEXT_MOTION_REST
  const remainingMs = durationMs - elapsedMs
  if (spec.enter && spec.enter !== 'none' && elapsedMs < lengthMs) {
    return motionAt(spec.enter, 'in', clamp01(elapsedMs / lengthMs))
  }
  if (spec.exit && spec.exit !== 'none' && remainingMs < lengthMs) {
    return motionAt(spec.exit, 'out', clamp01(1 - remainingMs / lengthMs))
  }
  return TEXT_MOTION_REST
}

// The opacity alone, for the fade-only callers. Same rules as textMotionTransform.
export function textMotionAlpha(
  spec: Pick<TextItem, 'enter' | 'exit' | 'motionMs'>,
  elapsedMs: number,
  durationMs: number
): number {
  return textMotionTransform(spec, elapsedMs, durationMs).alpha
}

// The transform partway through one phase. progress runs from 0 at the start of the phase to 1 at its end.
// 'in' runs from hidden to rest, and 'out' from rest to hidden.
function motionAt(
  motion: TextMotion,
  direction: 'in' | 'out',
  progress: number
): TextMotionTransform {
  // Opacity and reveal move linearly. Slides and pops are eased so they settle softly.
  const shown = direction === 'in' ? progress : 1 - progress
  const away = direction === 'in' ? 1 - easeOutCubic(progress) : easeInCubic(progress)
  const slide = TEXT_SLIDE_FRACTION * away
  switch (motion) {
    case 'fade':
      return { ...TEXT_MOTION_REST, alpha: shown }
    case 'slide-left':
      return { ...TEXT_MOTION_REST, alpha: shown, dxFrac: -slide }
    case 'slide-right':
      return { ...TEXT_MOTION_REST, alpha: shown, dxFrac: slide }
    case 'slide-top':
      return { ...TEXT_MOTION_REST, alpha: shown, dyFrac: -slide }
    case 'slide-bottom':
      return { ...TEXT_MOTION_REST, alpha: shown, dyFrac: slide }
    case 'pop':
      return {
        ...TEXT_MOTION_REST,
        scale: direction === 'in' ? easeOutBack(progress) : 1 - easeInCubic(progress)
      }
    case 'typewriter':
      return { ...TEXT_MOTION_REST, reveal: shown }
    case 'none':
      return TEXT_MOTION_REST
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number): number {
  return t ** 3
}

// Overshoots slightly before settling at 1, so a pop lands with a small bounce.
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
