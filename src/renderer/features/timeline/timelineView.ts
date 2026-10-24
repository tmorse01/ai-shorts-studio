// Pure view maths for the timeline pane (Epic 07, #85): where times fall on screen, ruler spacing,
// zoom limits, the target band, and scroll follow. No DOM, so each rule is tested directly.

// Pixels per millisecond at the limits: 5 px a second when zoomed out, 2000 px a second when in.
export const MIN_PX_PER_MS = 0.005
export const MAX_PX_PER_MS = 2
export const DEFAULT_PX_PER_MS = 0.1

// Room kept on the right of the timeline and around the playhead when it is followed.
const EDGE_PADDING_PX = 40
const FOLLOW_MARGIN_PX = 48

// Ruler intervals a person reads easily, from one second to two minutes.
const RULER_INTERVALS_MS = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000]

export function timeToX(ms: number, pxPerMs: number): number {
  return ms * pxPerMs
}

export function xToTime(x: number, pxPerMs: number): number {
  return Math.round(Math.max(x, 0) / pxPerMs)
}

export function clampZoom(pxPerMs: number): number {
  return Math.min(Math.max(pxPerMs, MIN_PX_PER_MS), MAX_PX_PER_MS)
}

// One step in (direction 1) or out (direction -1). Each step changes the scale by a quarter.
export function zoomStep(pxPerMs: number, direction: 1 | -1): number {
  return clampZoom(direction === 1 ? pxPerMs * 1.25 : pxPerMs / 1.25)
}

// The scale that fits durationMs into widthPx, leaving room at the right edge.
export function fitPxPerMs(durationMs: number, widthPx: number): number {
  const usable = Math.max(widthPx - EDGE_PADDING_PX, 1)
  return clampZoom(usable / Math.max(durationMs, 1))
}

// The gap between ruler labels: the first interval that leaves at least minSpacingPx between labels.
export function rulerIntervalMs(pxPerMs: number, minSpacingPx = 80): number {
  return (
    RULER_INTERVALS_MS.find((interval) => interval * pxPerMs >= minSpacingPx) ??
    RULER_INTERVALS_MS[RULER_INTERVALS_MS.length - 1]
  )
}

// Times for each ruler label from 0 up to totalMs.
export function rulerTicks(totalMs: number, pxPerMs: number): number[] {
  const interval = rulerIntervalMs(pxPerMs)
  const ticks: number[] = []
  for (let ms = 0; ms <= totalMs; ms += interval) ticks.push(ms)
  return ticks
}

// The total width the ruler and lanes need: the longest of the timeline, the target and a minute.
export function timelineWidthPx(durationMs: number, targetMaxMs: number, pxPerMs: number): number {
  return timeToX(Math.max(durationMs, targetMaxMs, 60_000), pxPerMs) + EDGE_PADDING_PX
}

// Where the target band sits: from the minimum to the maximum length, and where the warning tint
// starts (the maximum). The band is drawn from minMs to maxMs.
export function targetBand(
  minMs: number,
  maxMs: number,
  pxPerMs: number
): { leftPx: number; widthPx: number; overMaxPx: number } {
  return {
    leftPx: timeToX(minMs, pxPerMs),
    widthPx: timeToX(maxMs - minMs, pxPerMs),
    overMaxPx: timeToX(maxMs, pxPerMs)
  }
}

// The scroll position that keeps the playhead in view. It scrolls only when the playhead nears an
// edge of the viewport.
export function followPlayhead(scrollLeft: number, playheadX: number, viewWidthPx: number): number {
  if (playheadX < scrollLeft + FOLLOW_MARGIN_PX) return Math.max(playheadX - FOLLOW_MARGIN_PX, 0)
  if (playheadX > scrollLeft + viewWidthPx - FOLLOW_MARGIN_PX) {
    return Math.max(playheadX - (viewWidthPx - FOLLOW_MARGIN_PX), 0)
  }
  return scrollLeft
}
