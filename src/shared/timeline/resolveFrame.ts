// Pure timeline queries: what is on screen at a time, how long the timeline is, and where the next
// clip boundary falls (used to preload decoders). Clips are active from startMs up to, not
// including, startMs + durationMs.
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
    .map((active) => ({
      trackId: active.trackId,
      trackKind: active.trackKind,
      clipId: active.clip.id,
      mediaId: active.clip.mediaId,
      text: active.clip.text,
      sourceTimeMs: active.clip.sourceInMs + (tMs - active.clip.startMs),
      transform: active.clip.transform
    }))
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
