import type { TimelineCut } from './timeline'

/**
 * Pure helpers for the timeline editor. Two clocks matter here: source time (where a cut sits in the
 * original footage) and timeline time (where it plays in the short, measured from the short's start).
 * Blank timeline time between cuts maps to no source time at all.
 */

export const MIN_PIXELS_PER_SECOND = 4
export const MAX_PIXELS_PER_SECOND = 80
export const DEFAULT_PIXELS_PER_SECOND = 16

const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60]

/** Map a source time to timeline time, or null when that source moment is not in any cut. */
export function sourceToOutput(cuts: TimelineCut[], sourceSec: number): number | null {
  for (const c of cuts) {
    if (sourceSec >= c.startSec && sourceSec < c.endSec) return c.atSec + (sourceSec - c.startSec)
  }
  return null
}

/** Map a timeline time to source time, or null when that moment is blank. */
export function outputToSource(cuts: TimelineCut[], outputSec: number): number | null {
  for (const c of cuts) {
    if (outputSec >= c.atSec && outputSec < c.atSec + (c.endSec - c.startSec)) {
      return c.startSec + (outputSec - c.atSec)
    }
  }
  return null
}


export function secondsToPixels(sec: number, pixelsPerSecond: number): number {
  return sec * pixelsPerSecond
}

export function pixelsToSeconds(px: number, pixelsPerSecond: number): number {
  return px / pixelsPerSecond
}

export function clampPixelsPerSecond(pps: number): number {
  return Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, pps))
}

/** How close, in pixels, a moving edge must be to a target before it locks to it. */
export const SNAP_PX = 8

/** Snap a time to the nearest target within the threshold. Returns the time unchanged when none is close. */
export function snapTime(candidate: number, targets: number[], thresholdSec: number): number {
  let best = candidate
  let bestDist = thresholdSec
  for (const t of targets) {
    const dist = Math.abs(t - candidate)
    if (dist <= bestDist) {
      best = t
      bestDist = dist
    }
  }
  return best
}

/**
 * Adjust a drag's time delta so one of its moving points lands on a target, if one is close enough. The
 * points are the times the drag moves (a clip's start, its end, or both). The point that snaps closest
 * wins. With no close target, the delta is returned unchanged.
 */
export function snapDelta(points: number[], deltaSec: number, targets: number[], thresholdSec: number): number {
  let best = deltaSec
  let bestShift = thresholdSec
  for (const p of points) {
    const candidate = p + deltaSec
    const snapped = snapTime(candidate, targets, thresholdSec)
    const shift = Math.abs(snapped - candidate)
    if (shift > 0 && shift <= bestShift) {
      best = snapped - p
      bestShift = shift
    }
  }
  return best
}

/** Smallest ruler step whose ticks are at least `minTickPx` apart. */
export function rulerStep(pixelsPerSecond: number, minTickPx = 70): number {
  return RULER_STEPS.find((step) => step * pixelsPerSecond >= minTickPx) ?? RULER_STEPS[RULER_STEPS.length - 1]
}
