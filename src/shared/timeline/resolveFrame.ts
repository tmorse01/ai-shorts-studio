// Pure timeline queries: what is on screen at a time, how long the timeline is, and where the next
// clip boundary falls (used to preload decoders). Clips are active from startMs up to, not
// including, startMs + durationMs. A transition extends the outgoing clip past its end and the
// incoming clip before its start, for the length of its window (see ./transitions.ts).
import { resolveFramingAt, type ClipFraming, type FramingMode, type FramingPose } from './framing'
import {
  isCut,
  kindOf,
  transitionLevels,
  transitionWindow,
  type TransitionFade,
  type TransitionWindow
} from './transitions'
import type { Clip, Timeline, TrackKind, Transform, TransitionKind } from './timeline'

export type ClipAt = {
  trackId: string
  trackKind: TrackKind
  trackMuted: boolean
  trackIndex: number
  clip: Clip
  // Set while the clip is inside a transition window (see ./transitions.ts).
  fade?: TransitionFade
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
  // Set while the layer is inside a transition window. Absent otherwise, so the layer draws as normal.
  fade?: TransitionFade
}

interface TransitionRole {
  role: 'out' | 'in'
  kind: TransitionKind
  window: TransitionWindow
}

// The transition windows that touch each clip, keyed by clip id. A transition only counts when its
// two clips still meet at the cut on one track.
function transitionRoles(timeline: Timeline): Map<string, TransitionRole[]> {
  const roles = new Map<string, TransitionRole[]>()
  const clips = new Map<string, { trackId: string; clip: Clip }>()
  for (const track of timeline.tracks) {
    for (const clip of track.clips) clips.set(clip.id, { trackId: track.id, clip })
  }
  const add = (clipId: string, role: TransitionRole): void => {
    const list = roles.get(clipId) ?? []
    list.push(role)
    roles.set(clipId, list)
  }
  for (const transition of timeline.transitions ?? []) {
    const from = clips.get(transition.fromClipId)
    const to = clips.get(transition.toClipId)
    if (!from || !to || from.trackId !== to.trackId || !isCut(from.clip, to.clip)) continue
    const window = transitionWindow(transition, to.clip.startMs)
    const kind = kindOf(transition)
    add(from.clip.id, { role: 'out', kind, window })
    add(to.clip.id, { role: 'in', kind, window })
  }
  return roles
}

// The time span a clip is active over, widened by the windows of its transitions.
function activeSpan(
  clip: Clip,
  roles: readonly TransitionRole[]
): { startMs: number; endMs: number } {
  let startMs = clip.startMs
  let endMs = clip.startMs + clip.durationMs
  for (const item of roles) {
    if (item.role === 'in') startMs = Math.min(startMs, item.window.startMs)
    else endMs = Math.max(endMs, item.window.endMs)
  }
  return { startMs, endMs }
}

// The fade of a clip at tMs, when tMs is inside one of its transition windows.
function fadeAt(roles: readonly TransitionRole[], tMs: number): TransitionFade | undefined {
  for (const item of roles) {
    const { startMs, endMs } = item.window
    if (tMs < startMs || tMs >= endMs) continue
    const levels = transitionLevels(item.kind, (tMs - startMs) / (endMs - startMs))
    return item.role === 'out' ? levels.outgoing : levels.incoming
  }
  return undefined
}

// Every clip active at tMs, on every track, in draw order (track order, then clip order). Within a
// track, an incoming clip in a transition is drawn after the clip it replaces, so it sits on top.
export function clipsAt(timeline: Timeline, tMs: number): ClipAt[] {
  const roles = transitionRoles(timeline)
  const active: ClipAt[] = []
  timeline.tracks.forEach((track, trackIndex) => {
    const segment: { entry: ClipAt; incoming: boolean }[] = []
    for (const clip of track.clips) {
      const clipRoles = roles.get(clip.id) ?? []
      const span = activeSpan(clip, clipRoles)
      if (tMs < span.startMs || tMs >= span.endMs) continue
      const entry: ClipAt = {
        trackId: track.id,
        trackKind: track.kind,
        trackMuted: track.muted,
        trackIndex,
        clip
      }
      const fade = fadeAt(clipRoles, tMs)
      if (fade) entry.fade = fade
      const incoming = clipRoles.some(
        (item) => item.role === 'in' && tMs >= item.window.startMs && tMs < item.window.endMs
      )
      segment.push({ entry, incoming })
    }
    // Stable: only clips that are fading in move, to the top of their track.
    segment.sort((a, b) => Number(a.incoming) - Number(b.incoming))
    for (const item of segment) active.push(item.entry)
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
      if (active.fade) layer.fade = active.fade
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
