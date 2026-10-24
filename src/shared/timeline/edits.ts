// Pure edit operations on a timeline (Epic 07, #84). Each takes a timeline and returns a new one; the
// input is never mutated. The renderer wraps these as undoable commands. Every edit ends with the
// Main-track check, so a Main track never overlaps after any edit.
import type { Clip, Timeline, Track, Transition } from './timeline'

export class TimelineEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimelineEditError'
  }
}

type Located = { track: Track; clip: Clip }

function endOf(clip: Clip): number {
  return clip.startMs + clip.durationMs
}

function locate(timeline: Timeline, clipId: string): Located {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { track, clip }
  }
  throw new TimelineEditError(`No clip with id "${clipId}".`)
}

function trackById(timeline: Timeline, trackId: string): Track {
  const track = timeline.tracks.find((item) => item.id === trackId)
  if (!track) throw new TimelineEditError(`No track with id "${trackId}".`)
  return track
}

// Every clip edit goes through here, so a locked track refuses all of them in one place.
// setTrackFlag is the only edit that changes a locked track's flags.
function replaceTrack(timeline: Timeline, next: Track): Timeline {
  const current = timeline.tracks.find((track) => track.id === next.id)
  if (current?.locked) throw new TimelineEditError(`Track "${next.id}" is locked.`)
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => (track.id === next.id ? next : track))
  }
}

// Throws if a Main track has two clips that overlap. Returns the timeline so edits can end with it.
export function assertMainNoOverlap(timeline: Timeline): Timeline {
  for (const track of timeline.tracks) {
    if (track.role !== 'main') continue
    const sorted = [...track.clips].sort((a, b) => a.startMs - b.startMs)
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startMs < endOf(sorted[index - 1])) {
        throw new TimelineEditError(`The main track "${track.id}" has overlapping clips.`)
      }
    }
  }
  return timeline
}

// Adds a clip to a track at atMs. On the main track, the clips from atMs onward move right by the
// clip's length (a ripple insert). A clip cannot be inserted inside another main clip; split it first.
export function insertClip(
  timeline: Timeline,
  trackId: string,
  clip: Clip,
  atMs: number
): Timeline {
  const track = trackById(timeline, trackId)
  const placed = { ...clip, startMs: atMs }
  if (track.role !== 'main') {
    return assertMainNoOverlap(
      replaceTrack(timeline, { ...track, clips: [...track.clips, placed] })
    )
  }
  const insideAnother = track.clips.some((item) => item.startMs < atMs && atMs < endOf(item))
  if (insideAnother) throw new TimelineEditError('Split the clip at this point before inserting.')
  const shifted = track.clips.map((item) =>
    item.startMs >= atMs ? { ...item, startMs: item.startMs + clip.durationMs } : item
  )
  return assertMainNoOverlap(replaceTrack(timeline, { ...track, clips: [...shifted, placed] }))
}

// Moves a clip to a start time, on the same track or another one. Free layers can overlap. The main
// track cannot take a clip that overlaps another, and leaving the main track leaves a gap.
export function moveClip(
  timeline: Timeline,
  clipId: string,
  toTrackId: string,
  startMs: number
): Timeline {
  const { track: fromTrack, clip } = locate(timeline, clipId)
  const moved = { ...clip, startMs }
  const stripped = replaceTrack(timeline, {
    ...fromTrack,
    clips: fromTrack.clips.filter((item) => item.id !== clipId)
  })
  const target = trackById(stripped, toTrackId)
  return assertMainNoOverlap(replaceTrack(stripped, { ...target, clips: [...target.clips, moved] }))
}

// Trims one edge of a clip and clamps the result to what the edit allows: the source length, the
// start of the source, one frame of minimum length, and the neighbours on the main track.
export function trimClip(
  timeline: Timeline,
  clipId: string,
  edge: 'start' | 'end',
  boundaryMs: number,
  sourceLengthMs?: number
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  const others = track.clips.filter((item) => item.id !== clipId)
  const isMain = track.role === 'main'
  const previousEnd = isMain
    ? Math.max(0, ...others.filter((item) => endOf(item) <= clip.startMs).map(endOf))
    : 0
  const nextStart = isMain
    ? Math.min(
        Infinity,
        ...others.filter((item) => item.startMs >= endOf(clip)).map((item) => item.startMs)
      )
    : Infinity

  let trimmed: Clip
  if (edge === 'end') {
    const sourceLimit =
      sourceLengthMs === undefined ? Infinity : clip.startMs + (sourceLengthMs - clip.sourceInMs)
    const end = Math.round(Math.min(Math.max(boundaryMs, clip.startMs + 1), sourceLimit, nextStart))
    trimmed = { ...clip, durationMs: end - clip.startMs }
  } else {
    const earliest = Math.max(previousEnd, clip.startMs - clip.sourceInMs)
    const start = Math.round(Math.min(Math.max(boundaryMs, earliest), endOf(clip) - 1))
    const delta = start - clip.startMs
    trimmed = {
      ...clip,
      startMs: start,
      sourceInMs: clip.sourceInMs + delta,
      durationMs: endOf(clip) - start
    }
  }
  return assertMainNoOverlap(
    replaceTrack(timeline, {
      ...track,
      clips: track.clips.map((item) => (item.id === clipId ? trimmed : item))
    })
  )
}

// Splits a clip in two at atMs. The left part keeps the id; the right part gets newClipId.
export function splitClip(
  timeline: Timeline,
  clipId: string,
  atMs: number,
  newClipId: string
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  if (atMs <= clip.startMs || atMs >= endOf(clip)) {
    throw new TimelineEditError('A split must fall inside the clip.')
  }
  const left: Clip = { ...clip, durationMs: atMs - clip.startMs }
  const right: Clip = {
    ...clip,
    id: newClipId,
    startMs: atMs,
    durationMs: endOf(clip) - atMs,
    sourceInMs: clip.sourceInMs + (atMs - clip.startMs),
    linkedAudio: undefined
  }
  const clips = track.clips.flatMap((item) => (item.id === clipId ? [left, right] : [item]))
  return assertMainNoOverlap(replaceTrack(timeline, { ...track, clips }))
}

// Removes a clip. On the main track this leaves a gap. Transitions on the clip are removed too.
export function deleteClip(timeline: Timeline, clipId: string): Timeline {
  const { track } = locate(timeline, clipId)
  const next = replaceTrack(timeline, {
    ...track,
    clips: track.clips.filter((item) => item.id !== clipId)
  })
  return {
    ...next,
    transitions: (timeline.transitions ?? []).filter(
      (transition) => transition.fromClipId !== clipId && transition.toClipId !== clipId
    )
  }
}

// Closes the gap on a track that contains atMs: later clips move left by the gap's length. Nothing
// happens when there is no clip after the gap. Fails if atMs is inside a clip.
export function closeGap(timeline: Timeline, trackId: string, atMs: number): Timeline {
  const track = trackById(timeline, trackId)
  if (track.clips.some((item) => item.startMs < atMs && atMs < endOf(item))) {
    throw new TimelineEditError('Gaps can only be closed where there is no clip.')
  }
  const gapEnd = Math.min(
    ...track.clips.filter((item) => item.startMs >= atMs).map((item) => item.startMs)
  )
  if (!Number.isFinite(gapEnd)) return timeline
  const gapStart = Math.max(0, ...track.clips.filter((item) => endOf(item) <= atMs).map(endOf))
  const length = gapEnd - gapStart
  const clips = track.clips.map((item) =>
    item.startMs >= gapEnd ? { ...item, startMs: item.startMs - length } : item
  )
  return assertMainNoOverlap(replaceTrack(timeline, { ...track, clips }))
}

// Adds a transition between two clips on one track, with the first clip starting earlier.
export function addTransition(timeline: Timeline, transition: Transition): Timeline {
  const from = locate(timeline, transition.fromClipId)
  const to = locate(timeline, transition.toClipId)
  if (from.track.id !== to.track.id) {
    throw new TimelineEditError('A transition joins two clips on the same track.')
  }
  if (from.clip.startMs >= to.clip.startMs) {
    throw new TimelineEditError('The first clip of a transition must start before the second.')
  }
  const existing = timeline.transitions ?? []
  if (existing.some((item) => item.id === transition.id)) {
    throw new TimelineEditError(`A transition with id "${transition.id}" already exists.`)
  }
  return { ...timeline, transitions: [...existing, transition] }
}

export function removeTransition(timeline: Timeline, transitionId: string): Timeline {
  return {
    ...timeline,
    transitions: (timeline.transitions ?? []).filter((item) => item.id !== transitionId)
  }
}

export function resizeTransition(
  timeline: Timeline,
  transitionId: string,
  durationMs: number
): Timeline {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new TimelineEditError('A transition needs a whole, positive length.')
  }
  const existing = timeline.transitions ?? []
  if (!existing.some((item) => item.id === transitionId)) {
    throw new TimelineEditError(`No transition with id "${transitionId}".`)
  }
  return {
    ...timeline,
    transitions: existing.map((item) => (item.id === transitionId ? { ...item, durationMs } : item))
  }
}

// Splits the sound off a clip onto an audio track. The new audio clip covers the same source and
// time; the video clip records it as linkedAudio.
export function detachAudio(
  timeline: Timeline,
  clipId: string,
  audioTrackId: string,
  audioClipId: string
): Timeline {
  const { track: videoTrack, clip } = locate(timeline, clipId)
  const audioTrack = trackById(timeline, audioTrackId)
  if (audioTrack.kind !== 'audio')
    throw new TimelineEditError('Detached audio needs an audio track.')
  if (clip.linkedAudio) throw new TimelineEditError('This clip already has detached audio.')
  const audioClip: Clip = {
    ...clip,
    id: audioClipId,
    linkedAudio: undefined,
    transform: clip.transform
  }
  let next = replaceTrack(timeline, {
    ...videoTrack,
    clips: videoTrack.clips.map((item) =>
      item.id === clipId ? { ...item, linkedAudio: audioClipId } : item
    )
  })
  const target = trackById(next, audioTrackId)
  next = replaceTrack(next, { ...target, clips: [...target.clips, audioClip] })
  return assertMainNoOverlap(next)
}

// Turns a track's mute or lock flag on or off. This is the only edit that works on a locked track,
// so a locked track can still be unlocked.
export function setTrackFlag(
  timeline: Timeline,
  trackId: string,
  flag: 'muted' | 'locked',
  value: boolean
): Timeline {
  trackById(timeline, trackId)
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      track.id === trackId ? { ...track, [flag]: value } : track
    )
  }
}

// Adds an empty track. Ids must be unique on the timeline.
export function addTrack(timeline: Timeline, track: Track): Timeline {
  if (timeline.tracks.some((item) => item.id === track.id)) {
    throw new TimelineEditError(`A track with id "${track.id}" already exists.`)
  }
  return { ...timeline, tracks: [...timeline.tracks, { ...track, clips: [] }] }
}

// Moves one or more clips to startMs on a track, as one edit (Epic 07, #88). The moving clips keep
// their spacing: startMs is where the first clip's block starts. On the main track the block is
// inserted there: clips from that point onward shift right by the block's span, and the gap the block
// leaves behind stays where it was. An insert point inside another main clip snaps to that clip's
// nearer edge. Free layers take the clips where they are dropped and may overlap. A clip moves only to
// a track of its own kind (main and overlay video both count as video), and no move touches a locked
// track.
export function placeClips(
  timeline: Timeline,
  clipIds: readonly string[],
  toTrackId: string,
  startMs: number
): Timeline {
  if (clipIds.length === 0) return timeline
  if (new Set(clipIds).size !== clipIds.length) {
    throw new TimelineEditError('Each clip can be moved only once in one edit.')
  }
  const moving = clipIds.map((id) => locate(timeline, id).clip)
  const sources = clipIds.map((id) => locate(timeline, id).track)
  const target = trackById(timeline, toTrackId)
  if (target.locked) throw new TimelineEditError(`Track "${target.id}" is locked.`)
  for (const source of sources) {
    if (source.locked) throw new TimelineEditError(`Track "${source.id}" is locked.`)
    if (source.kind !== target.kind) {
      throw new TimelineEditError('Clips can only move to a track of the same kind.')
    }
  }

  const movingIds = new Set(clipIds)
  const base = Math.min(...moving.map((clip) => clip.startMs))
  const span = Math.max(...moving.map(endOf)) - base
  const stripped = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => !movingIds.has(clip.id))
  }))

  let at = Math.max(0, Math.round(startMs))
  let remaining = stripped.find((track) => track.id === toTrackId)?.clips ?? []
  if (target.role === 'main') {
    const inside = remaining.find((item) => item.startMs < at && at < endOf(item))
    if (inside) {
      at = at - inside.startMs <= endOf(inside) - at ? inside.startMs : endOf(inside)
    }
    remaining = remaining.map((item) =>
      item.startMs >= at ? { ...item, startMs: item.startMs + span } : item
    )
  }

  const placed = moving.map((clip) => ({ ...clip, startMs: at + (clip.startMs - base) }))
  const tracks = stripped.map((track) =>
    track.id === toTrackId ? { ...track, clips: [...remaining, ...placed] } : track
  )
  return assertMainNoOverlap({ ...timeline, tracks })
}
