/** Pure helpers for the video player. No DOM here, so they are unit-tested in tests/player-math.test.ts. */

export const FRAME_RATE = 30
export const SKIP_SEC = 5
export const CONTROLS_HIDE_MS = 2500
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const

export interface TimeSpan {
  startSec: number
  endSec: number
}

/** Clamp a time into [0, duration]. A duration of 0 or less means "not known yet", so only the floor applies. */
export function clampTime(sec: number, duration: number): number {
  if (!Number.isFinite(sec)) return 0
  const floored = Math.max(0, sec)
  return duration > 0 ? Math.min(floored, duration) : floored
}

/** Source time at a fraction of the bar (0 to 1). */
export function timeAtFraction(fraction: number, duration: number): number {
  if (duration <= 0) return 0
  return clampTime(Math.min(1, Math.max(0, fraction)) * duration, duration)
}

/** Fraction of the bar (0 to 1) at a source time. */
export function fractionAtTime(sec: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.min(1, Math.max(0, sec / duration))
}

/** Fraction of the bar under a pointer, given the bar's bounding box. */
export function pointerFraction(clientX: number, bar: { left: number; width: number }): number {
  if (bar.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - bar.left) / bar.width))
}

/** Target time for a relative skip such as -5s or +1 frame. */
export function skipTarget(current: number, deltaSec: number, duration: number): number {
  return clampTime(current + deltaSec, duration)
}

/** Length of one frame in seconds at the given frame rate. */
export function frameStepSec(fps: number = FRAME_RATE): number {
  return 1 / fps
}

/**
 * End of the buffered range that contains `sec`, or `sec` itself when nothing is buffered there.
 * Accepts the shape of a TimeRanges list copied into plain objects.
 */
export function bufferedEnd(ranges: TimeSpan[], sec: number): number {
  for (const r of ranges) {
    if (sec >= r.startSec && sec <= r.endSec) return r.endSec
  }
  return sec
}

/** Left and width as CSS percentages for a span on the scrubber. */
export function spanPercent(span: TimeSpan, duration: number): { left: string; width: string } {
  if (duration <= 0) return { left: '0%', width: '0%' }
  const left = fractionAtTime(span.startSec, duration) * 100
  const right = fractionAtTime(span.endSec, duration) * 100
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` }
}

/** Timecode for the control bar: m:ss, or h:mm:ss for footage over an hour. */
export function timecode(sec: number): string {
  const total = Math.floor(clampTime(sec, 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
