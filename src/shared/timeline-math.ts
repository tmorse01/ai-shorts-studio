import { MIN_SEGMENT_SEC, type Segment } from './timeline'

/**
 * Pure helpers for the timeline editor. Two clocks matter here: source time (where a cut sits in the
 * original footage) and output time (where it plays in the finished short, cuts laid end to end).
 */

export const MIN_PIXELS_PER_SECOND = 4
export const MAX_PIXELS_PER_SECOND = 80
export const DEFAULT_PIXELS_PER_SECOND = 16

const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60]

export function totalOutputSec(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0)
}

/** Output-time start of each segment. Index i begins where segment i-1 ends in the output. */
export function outputStarts(segments: Segment[]): number[] {
  const starts: number[] = []
  let offset = 0
  for (const s of segments) {
    starts.push(offset)
    offset += s.endSec - s.startSec
  }
  return starts
}

/** Map a source time to output time, or null when that source moment is not in any cut. */
export function sourceToOutput(segments: Segment[], sourceSec: number): number | null {
  const starts = outputStarts(segments)
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (sourceSec >= s.startSec && sourceSec < s.endSec) return starts[i] + (sourceSec - s.startSec)
  }
  return null
}

/** Map an output time to source time. Times past the end clamp to the last cut's end. */
export function outputToSource(segments: Segment[], outputSec: number): number {
  if (segments.length === 0) return 0
  const starts = outputStarts(segments)
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i].endSec - segments[i].startSec
    if (outputSec < starts[i] + len) return segments[i].startSec + Math.max(0, outputSec - starts[i])
  }
  return segments[segments.length - 1].endSec
}

/** Drag the left edge of a cut. It cannot pass the right edge or leave the source. */
export function trimStart(seg: Segment, deltaSec: number): Segment {
  const startSec = Math.max(0, Math.min(seg.startSec + deltaSec, seg.endSec - MIN_SEGMENT_SEC))
  return { startSec, endSec: seg.endSec }
}

/** Drag the right edge of a cut. It cannot pass the left edge or run past the source. */
export function trimEnd(seg: Segment, deltaSec: number, durationSec: number): Segment {
  const endSec = Math.min(durationSec, Math.max(seg.endSec + deltaSec, seg.startSec + MIN_SEGMENT_SEC))
  return { startSec: seg.startSec, endSec }
}

/** Slide a cut along the source without changing its length. */
export function moveSegment(seg: Segment, deltaSec: number, durationSec: number): Segment {
  const len = seg.endSec - seg.startSec
  const startSec = Math.max(0, Math.min(seg.startSec + deltaSec, durationSec - len))
  return { startSec, endSec: startSec + len }
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

/** Smallest ruler step whose ticks are at least `minTickPx` apart. */
export function rulerStep(pixelsPerSecond: number, minTickPx = 70): number {
  return RULER_STEPS.find((step) => step * pixelsPerSecond >= minTickPx) ?? RULER_STEPS[RULER_STEPS.length - 1]
}
