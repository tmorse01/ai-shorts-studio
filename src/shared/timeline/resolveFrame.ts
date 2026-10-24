// Pure timeline queries: what is on screen at a time, how long the timeline is, and where the next
// clip boundary falls (used to preload decoders). Clips are active from startMs up to, not
// including, startMs + durationMs.
import { resolveFramingAt, type ClipFraming, type FramingMode, type FramingPose } from './framing'
import type { Clip, Timeline, TrackKind, Transform } from './timeline'

export type ClipAt = {
  trackId: string
  trackKind: TrackKind
  trackMuted: boolean
  trackIndex: number
  clip: Clip
}

export type ResolvedLayer = {
  trackId: string
  trackKind: TrackKind
  clipId: string
  mediaId?: string
  text?: string
  // The source time to show for this layer, in ms.
  sourceTimeMs: number
  transform: Transform
  // The framing pose at this time, when the clip has framing (see ./framing.ts).
  framing?: { mode: FramingMode } & FramingPose
  // The clip's stored framing, start and end poses included, for the canvas outlines.
  clipFraming?: ClipFraming
}

// Every clip active at tMs, on every track, in draw order (track order, then clip order).
export function clipsAt(timeline: Timeline, tMs: number): ClipAt[] {
  const active: ClipAt[] = []
  timeline.tracks.forEach((track, trackIndex) => {
    for (const clip of track.clips) {
      if (tMs >= clip.startMs && tMs < clip.startMs + clip.durationMs) {
        active.push({
          trackId: track.id,
          trackKind: track.kind,
          trackMuted: track.muted,
          trackIndex,
          clip
        })
      }
    }
  })
  return active
}

// The layers to draw at tMs. Muted tracks are left out.
export function resolveFrame(timeline: Timeline, tMs: number): ResolvedLayer[] {
  return clipsAt(timeline, tMs)
    .filter((active) => !active.trackMuted)
    .map((active) => {
      const { clip } = active
      const layer: ResolvedLayer = {
        trackId: active.trackId,
        trackKind: active.trackKind,
        clipId: clip.id,
        mediaId: clip.mediaId,
        text: clip.text,
        sourceTimeMs: clip.sourceInMs + (tMs - clip.startMs),
        transform: clip.transform
      }
      if (clip.framing) {
        layer.framing = resolveFramingAt(clip.framing, clip.startMs, clip.durationMs, tMs)
        layer.clipFraming = clip.framing
      }
      return layer
    })
}

// The end of the last clip on any track, or 0 for an empty timeline.
export function timelineDurationMs(timeline: Timeline): number {
  let end = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.startMs + clip.durationMs)
    }
  }
  return end
}

// The first clip start or end strictly after tMs, on any track, or null if there is none.
export function nextClipBoundary(timeline: Timeline, tMs: number): number | null {
  let next: number | null = null
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      for (const boundary of [clip.startMs, clip.startMs + clip.durationMs]) {
        if (boundary > tMs && (next === null || boundary < next)) next = boundary
      }
    }
  }
  return next
}
