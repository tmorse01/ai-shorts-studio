// Auto-ducking (Epic 12, #124): music is lowered while narration plays. Pure rules, shared by the
// preview mix and export. A short stores its settings on the timeline; the narration ranges and the
// settings become one gain envelope over timeline time. Times are timeline milliseconds.
import { z } from 'zod'
import type { Timeline } from './timeline'

export const duckingSchema = z.object({
  // How far music drops under narration, in dB. 0 turns ducking off.
  amountDb: z.number().min(0).max(24),
  // How long the drop takes before narration starts, and how long the return takes after it ends.
  attackMs: z.number().int().min(0).max(2000),
  releaseMs: z.number().int().min(0).max(5000)
})
export type DuckingSettings = z.infer<typeof duckingSchema>

export const DEFAULT_DUCKING: DuckingSettings = { amountDb: 12, attackMs: 80, releaseMs: 400 }

export interface TimeRange {
  startMs: number
  endMs: number
}

export interface EnvelopePoint {
  tMs: number
  // Linear gain applied to the music. 1 is no change.
  gain: number
}

// The short's ducking settings, or the defaults when none are stored.
export function duckingFor(timeline: Timeline): DuckingSettings {
  return timeline.ducking ?? DEFAULT_DUCKING
}

// The timeline spans of the narration: clips on unmuted narration tracks that are not muted. Ranges
// are returned as stored, in track order. The envelope sorts and merges them.
export function narrationRanges(timeline: Timeline): TimeRange[] {
  const ranges: TimeRange[] = []
  for (const track of timeline.tracks) {
    if (track.role !== 'narration' || track.kind !== 'audio' || track.muted) continue
    for (const clip of track.clips) {
      if (clip.muted) continue
      ranges.push({ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs })
    }
  }
  return ranges
}

// The gain envelope for the narration ranges. Each narration span gets a drop that starts attackMs
// before it and ends releaseMs after it. Two spans closer than attack plus release are merged, so
// the envelope never has to rise and fall again inside the gap. Points are in time order.
export function duckEnvelope(
  ranges: readonly TimeRange[],
  settings: DuckingSettings
): EnvelopePoint[] {
  const duck = 10 ** (-settings.amountDb / 20)
  const sorted = ranges
    .filter((range) => range.endMs > range.startMs)
    .map((range) => ({ ...range }))
    .sort((a, b) => a.startMs - b.startMs)

  const merged: TimeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.startMs - last.endMs < settings.attackMs + settings.releaseMs) {
      last.endMs = Math.max(last.endMs, range.endMs)
    } else {
      merged.push(range)
    }
  }

  const points: EnvelopePoint[] = []
  for (const range of merged) {
    points.push({ tMs: range.startMs - settings.attackMs, gain: 1 })
    points.push({ tMs: range.startMs, gain: duck })
    points.push({ tMs: range.endMs, gain: duck })
    points.push({ tMs: range.endMs + settings.releaseMs, gain: 1 })
  }
  return points
}

// The envelope gain at tMs, linear between points. Outside the envelope the gain is 1.
export function envelopeGainAt(points: readonly EnvelopePoint[], tMs: number): number {
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (tMs >= from.tMs && tMs < to.tMs) {
      const progress = (tMs - from.tMs) / (to.tMs - from.tMs)
      return from.gain + (to.gain - from.gain) * progress
    }
  }
  return 1
}

// The envelope inside a window: the gain at both ends and every point between them. Used to draw
// the gain line on one clip.
export function envelopeWithin(
  points: readonly EnvelopePoint[],
  fromMs: number,
  toMs: number
): EnvelopePoint[] {
  if (toMs <= fromMs) return []
  const inside = points.filter((point) => point.tMs > fromMs && point.tMs < toMs)
  return [
    { tMs: fromMs, gain: envelopeGainAt(points, fromMs) },
    ...inside,
    { tMs: toMs, gain: envelopeGainAt(points, toMs) }
  ]
}
