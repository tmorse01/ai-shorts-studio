// The shared description of a transition on a cut (Epic 07, #92). Export (Epic 17) and the preview
// both read it, so a transition looks and sounds the same in both. Pure: no DOM, no store.
//
// A transition is centred on the cut between two adjacent clips on one track. The window runs from
// cut - before to cut + after, where before is half the length (rounded down) and after is the rest.
// The outgoing clip plays on past its cut and the incoming clip starts before its own start, so each
// one needs source footage at its handle: the outgoing clip after its out point, the incoming clip
// before its in point. Clip lengths on the timeline do not change.
import type { Clip, Timeline, Transition, TransitionKind } from './timeline'

export const DEFAULT_TRANSITION_MS = 300

export const TRANSITION_KINDS: readonly TransitionKind[] = ['crossfade', 'dip-to-black']

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  crossfade: 'Crossfade',
  'dip-to-black': 'Dip to black'
}

export function kindOf(transition: Transition): TransitionKind {
  return transition.kind ?? 'crossfade'
}

export interface TransitionSides {
  // Length of the window before the cut.
  beforeMs: number
  // Length of the window after the cut.
  afterMs: number
}

export function transitionSides(durationMs: number): TransitionSides {
  const beforeMs = Math.floor(durationMs / 2)
  return { beforeMs, afterMs: durationMs - beforeMs }
}

export interface TransitionWindow {
  startMs: number
  endMs: number
}

export function transitionWindow(transition: Transition, cutMs: number): TransitionWindow {
  const { beforeMs, afterMs } = transitionSides(transition.durationMs)
  return { startMs: cutMs - beforeMs, endMs: cutMs + afterMs }
}

// How one clip is drawn and mixed during a transition. opacity is the picture's alpha over what is
// already drawn. gain is the linear sound level before the clip's own gain. overBlack means the frame
// is drawn over black, which a dip needs at its lowest point.
export interface TransitionFade {
  opacity: number
  gain: number
  overBlack: boolean
}

export interface TransitionLevels {
  outgoing: TransitionFade
  incoming: TransitionFade
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

// The levels of both clips at a progress through the window, 0 at its start and 1 at its end.
// Crossfade keeps the outgoing picture fully opaque underneath and fades the incoming one over it, so
// the picture is an exact blend. The sound fades linearly both ways. A dip fades the outgoing clip to
// black in the first half and the incoming clip up from black in the second.
export function transitionLevels(kind: TransitionKind, progress: number): TransitionLevels {
  const p = clamp01(progress)
  if (kind === 'dip-to-black') {
    const outgoing = clamp01(1 - 2 * p)
    const incoming = clamp01(2 * p - 1)
    return {
      outgoing: { opacity: outgoing, gain: outgoing, overBlack: true },
      incoming: { opacity: incoming, gain: incoming, overBlack: true }
    }
  }
  return {
    outgoing: { opacity: 1, gain: 1 - p, overBlack: false },
    incoming: { opacity: p, gain: p, overBlack: false }
  }
}

// Whether a clip sits right before another on the same track, with its end on the other's start.
export function isCut(from: Clip, to: Clip): boolean {
  return from.startMs + from.durationMs === to.startMs
}

// The longest transition the handles allow on a cut. The outgoing clip's handle is the source after
// its out point, from its source length. The incoming clip's handle is the source before its in
// point, which is its sourceInMs. Without a source length the outgoing handle is not limited here.
// The window cannot reach past the other clip on either side, so it stays within one clip per side.
export function transitionLimitMs(from: Clip, to: Clip, fromSourceLengthMs?: number): number {
  const incomingHandle = to.sourceInMs
  const outgoingHandle =
    fromSourceLengthMs === undefined
      ? Infinity
      : Math.max(0, fromSourceLengthMs - (from.sourceInMs + from.durationMs))
  const maxBefore = Math.min(incomingHandle, from.durationMs)
  const maxAfter = Math.min(outgoingHandle, to.durationMs)
  // A window of length D has floor(D / 2) before the cut and ceil(D / 2) after it.
  return Math.max(0, Math.min(2 * maxBefore + 1, 2 * maxAfter))
}

// Clamps a requested length to the limit and to a whole, positive length.
export function clampTransitionMs(requestedMs: number, limitMs: number): number {
  if (!Number.isFinite(requestedMs)) return 0
  return Math.max(0, Math.min(Math.round(requestedMs), Math.floor(limitMs)))
}

// The transition with this id, or undefined when there is none.
export function transitionById(timeline: Timeline, transitionId: string): Transition | undefined {
  return (timeline.transitions ?? []).find((item) => item.id === transitionId)
}

export function findClip(
  timeline: Timeline,
  clipId: string
): { trackId: string; clip: Clip } | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { trackId: track.id, clip }
  }
  return null
}

// The clip that ends where the given clip starts, on the same track, with the two as a cut. Null when
// the clip has no such neighbour, for example the first clip of a track.
export function cutBefore(timeline: Timeline, toClipId: string): { from: Clip; to: Clip } | null {
  const found = findClip(timeline, toClipId)
  if (!found) return null
  const from = found.clip
  const track = timeline.tracks.find((item) => item.id === found.trackId)
  const before = track?.clips.find((item) => item.id !== toClipId && isCut(item, from))
  return before ? { from: before, to: from } : null
}

// The limit for an existing transition, from the timeline and the source length of each clip's
// footage. Returns null when the transition or its clips are gone.
export function transitionLimitFor(
  timeline: Timeline,
  transition: Transition,
  sourceLengthOf: (clip: Clip) => number | undefined
): number | null {
  const from = findClip(timeline, transition.fromClipId)
  const to = findClip(timeline, transition.toClipId)
  if (!from || !to || !isCut(from.clip, to.clip)) return null
  return transitionLimitMs(from.clip, to.clip, sourceLengthOf(from.clip))
}

// Whether a transition's length fits its cut on the timeline: both clips present, on the same track,
// meeting at the cut, and each side of the window within the clip it covers. Edits that move or trim
// clips use this to drop transitions that no longer have a cut to sit on. Handles are not checked
// here, because the timeline does not know source lengths.
export function transitionFitsCut(timeline: Timeline, transition: Transition): boolean {
  const from = findClip(timeline, transition.fromClipId)
  const to = findClip(timeline, transition.toClipId)
  if (!from || !to || from.trackId !== to.trackId) return false
  if (!isCut(from.clip, to.clip)) return false
  const { beforeMs, afterMs } = transitionSides(transition.durationMs)
  return beforeMs <= from.clip.durationMs && afterMs <= to.clip.durationMs
}
