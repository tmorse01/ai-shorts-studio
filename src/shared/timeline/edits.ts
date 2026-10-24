// Pure edit operations on a timeline (Epic 07, #84). Each takes a timeline and returns a new one; the
// input is never mutated. The renderer wraps these as undoable commands. Every edit ends with settle(),
// which runs the Main-track check and keeps linked audio on its video clip's time (#91).
import { CENTRED_FILL, clipFramingSchema, type ClipFraming } from './framing'
import type { Clip, Timeline, Track, Transform, Transition, TransitionKind } from './timeline'
import { loopLayout } from './loopFill'
import { duckingFor, duckingSchema, type DuckingSettings } from './ducking'
import {
  clampTransitionMs,
  cutBefore,
  isCut,
  transitionFitsCut,
  transitionLimitFor,
  transitionLimitMs
} from './transitions'

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

// The track that holds a clip, or undefined when no track has it.
function trackHolding(timeline: Timeline, clipId: string): Track | undefined {
  return timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId))
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

// The video clip whose linkedAudio is clipId, or undefined when clipId is not linked audio. Linked
// audio moves, trims and splits with its video clip, so it is edited through that clip.
function ownerOf(timeline: Timeline, clipId: string): Clip | undefined {
  for (const track of timeline.tracks) {
    const owner = track.clips.find((item) => item.linkedAudio === clipId)
    if (owner) return owner
  }
  return undefined
}

function refuseLinked(timeline: Timeline, clipId: string): void {
  if (ownerOf(timeline, clipId)) {
    throw new TimelineEditError(
      'Linked audio moves with its video clip. Edit the video clip instead.'
    )
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

// The last step of every edit. It runs the Main-track check, then sets each linked audio clip to the
// start, length and source in of its video clip, on whatever audio track it sits. A locked audio track
// refuses the change, like any other clip edit.
// Drops transitions whose cut no longer fits: a clip moved, trimmed or deleted off the cut.
function pruneTransitions(timeline: Timeline): Timeline {
  const transitions = timeline.transitions
  if (!transitions || transitions.length === 0) return timeline
  const kept = transitions.filter((item) => transitionFitsCut(timeline, item))
  return kept.length === transitions.length ? timeline : { ...timeline, transitions: kept }
}

export function settle(timeline: Timeline): Timeline {
  assertMainNoOverlap(timeline)
  let next = pruneTransitions(timeline)
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (!clip.linkedAudio) continue
      const audioTrack = trackHolding(next, clip.linkedAudio)
      const audio = audioTrack?.clips.find((item) => item.id === clip.linkedAudio)
      if (!audioTrack || !audio) continue
      if (
        audio.startMs === clip.startMs &&
        audio.durationMs === clip.durationMs &&
        audio.sourceInMs === clip.sourceInMs
      ) {
        continue
      }
      next = replaceTrack(next, {
        ...audioTrack,
        clips: audioTrack.clips.map((item) =>
          item.id === audio.id
            ? {
                ...item,
                startMs: clip.startMs,
                durationMs: clip.durationMs,
                sourceInMs: clip.sourceInMs
              }
            : item
        )
      })
    }
  }
  return next
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
    return settle(replaceTrack(timeline, { ...track, clips: [...track.clips, placed] }))
  }
  const insideAnother = track.clips.some((item) => item.startMs < atMs && atMs < endOf(item))
  if (insideAnother) throw new TimelineEditError('Split the clip at this point before inserting.')
  const shifted = track.clips.map((item) =>
    item.startMs >= atMs ? { ...item, startMs: item.startMs + clip.durationMs } : item
  )
  return settle(replaceTrack(timeline, { ...track, clips: [...shifted, placed] }))
}

// Moves a clip to a start time, on the same track or another one. Free layers can overlap. The main
// track cannot take a clip that overlaps another, and leaving the main track leaves a gap.
export function moveClip(
  timeline: Timeline,
  clipId: string,
  toTrackId: string,
  startMs: number
): Timeline {
  refuseLinked(timeline, clipId)
  const { track: fromTrack, clip } = locate(timeline, clipId)
  const moved = { ...clip, startMs }
  const stripped = replaceTrack(timeline, {
    ...fromTrack,
    clips: fromTrack.clips.filter((item) => item.id !== clipId)
  })
  const target = trackById(stripped, toTrackId)
  return settle(replaceTrack(stripped, { ...target, clips: [...target.clips, moved] }))
}

// Trims one edge of a clip and clamps the result to what the edit allows: the source length, the
// start of the source, one frame of minimum length, and the neighbours on the main track. Linked audio
// follows the trim.
export function trimClip(
  timeline: Timeline,
  clipId: string,
  edge: 'start' | 'end',
  boundaryMs: number,
  sourceLengthMs?: number
): Timeline {
  refuseLinked(timeline, clipId)
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
  return settle(
    replaceTrack(timeline, {
      ...track,
      clips: track.clips.map((item) => (item.id === clipId ? trimmed : item))
    })
  )
}

// Splits a clip in two at atMs. The left part keeps the id; the right part gets newClipId. A clip with
// linked audio also needs newAudioId: the audio is split the same way, and the right part gets it.
export function splitClip(
  timeline: Timeline,
  clipId: string,
  atMs: number,
  newClipId: string,
  newAudioId?: string
): Timeline {
  refuseLinked(timeline, clipId)
  const { track, clip } = locate(timeline, clipId)
  if (atMs <= clip.startMs || atMs >= endOf(clip)) {
    throw new TimelineEditError('A split must fall inside the clip.')
  }
  const audioTrack = clip.linkedAudio ? trackHolding(timeline, clip.linkedAudio) : undefined
  if (clip.linkedAudio && audioTrack && !newAudioId) {
    throw new TimelineEditError('Splitting linked audio needs an id for the new audio clip.')
  }
  const left: Clip = { ...clip, durationMs: atMs - clip.startMs }
  const right: Clip = {
    ...clip,
    id: newClipId,
    startMs: atMs,
    durationMs: endOf(clip) - atMs,
    sourceInMs: clip.sourceInMs + (atMs - clip.startMs),
    linkedAudio: audioTrack && newAudioId ? newAudioId : undefined
  }
  const clips = track.clips.flatMap((item) => (item.id === clipId ? [left, right] : [item]))
  let next = replaceTrack(timeline, { ...track, clips })
  if (audioTrack && newAudioId && clip.linkedAudio) {
    const audio = audioTrack.clips.find((item) => item.id === clip.linkedAudio)
    if (audio) {
      const rightAudio: Clip = {
        ...audio,
        id: newAudioId,
        startMs: right.startMs,
        durationMs: right.durationMs,
        sourceInMs: right.sourceInMs,
        linkedAudio: undefined
      }
      next = replaceTrack(next, {
        ...audioTrack,
        clips: [...audioTrack.clips, rightAudio]
      })
    }
  }
  return settle(next)
}

// Removes a clip. On the main track this leaves a gap. Transitions on the clip are removed too, and so
// is its linked audio clip.
export function deleteClip(timeline: Timeline, clipId: string): Timeline {
  refuseLinked(timeline, clipId)
  const { track, clip } = locate(timeline, clipId)
  let next = replaceTrack(timeline, {
    ...track,
    clips: track.clips.filter((item) => item.id !== clipId)
  })
  const audioTrack = clip.linkedAudio ? trackHolding(next, clip.linkedAudio) : undefined
  if (clip.linkedAudio && audioTrack) {
    next = replaceTrack(next, {
      ...audioTrack,
      clips: audioTrack.clips.filter((item) => item.id !== clip.linkedAudio)
    })
  }
  const removed = new Set([clipId, clip.linkedAudio].filter((id): id is string => id !== undefined))
  return settle({
    ...next,
    transitions: (timeline.transitions ?? []).filter(
      (transition) => !removed.has(transition.fromClipId) && !removed.has(transition.toClipId)
    )
  })
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
  return settle(replaceTrack(timeline, { ...track, clips }))
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
  if (!isCut(from.clip, to.clip)) {
    throw new TimelineEditError('A transition sits on a cut: the clips must meet.')
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

// Adds a transition on the cut before toClipId. The length is clamped to the handles on that cut, so
// it can be shorter than asked. sourceLengthOf gives a clip's footage length, when it is known.
export function addCutTransition(
  timeline: Timeline,
  transitionId: string,
  toClipId: string,
  kind: TransitionKind,
  requestedMs: number,
  sourceLengthOf: (clip: Clip) => number | undefined
): Timeline {
  const cut = cutBefore(timeline, toClipId)
  if (!cut) {
    throw new TimelineEditError('A transition needs a cut: the clip must follow another clip.')
  }
  const limit = transitionLimitMs(cut.from, cut.to, sourceLengthOf(cut.from))
  const durationMs = clampTransitionMs(requestedMs, limit)
  if (durationMs < 1) {
    throw new TimelineEditError('The handles on this cut are too short for a transition.')
  }
  return addTransition(timeline, {
    id: transitionId,
    fromClipId: cut.from.id,
    toClipId,
    durationMs,
    kind
  })
}

// Sets a transition's length, clamped to the handles on its cut. Dragging a transition edge calls this.
export function resizeCutTransition(
  timeline: Timeline,
  transitionId: string,
  requestedMs: number,
  sourceLengthOf: (clip: Clip) => number | undefined
): Timeline {
  const transition = (timeline.transitions ?? []).find((item) => item.id === transitionId)
  if (!transition) throw new TimelineEditError(`No transition with id "${transitionId}".`)
  const limit = transitionLimitFor(timeline, transition, sourceLengthOf)
  if (limit === null) throw new TimelineEditError('The transition has no cut to sit on.')
  const durationMs = clampTransitionMs(requestedMs, limit)
  if (durationMs < 1) {
    throw new TimelineEditError('The handles on this cut are too short for a transition.')
  }
  return resizeTransition(timeline, transitionId, durationMs)
}

// Splits the sound off a clip onto an audio track. The new audio clip covers the same source and
// time; the video clip records it as linkedAudio.
export function detachAudio(
  timeline: Timeline,
  clipId: string,
  audioTrackId: string,
  audioClipId: string
): Timeline {
  refuseLinked(timeline, clipId)
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
  return settle(next)
}

// Sets a clip's mute, volume and fades. Gain is linear, 0 to 2, and only the fields given change. Fades
// are clamped to the clip's length. For a video clip with detached audio, edit the audio clip: that is
// the one whose sound plays.
export interface ClipAudioChange {
  muted?: boolean
  gain?: number
  fadeInMs?: number
  fadeOutMs?: number
}

export function setClipAudio(
  timeline: Timeline,
  clipId: string,
  change: ClipAudioChange
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  if (
    change.gain !== undefined &&
    (!Number.isFinite(change.gain) || change.gain < 0 || change.gain > 2)
  ) {
    throw new TimelineEditError('Clip volume must be between 0 and 2.')
  }
  for (const fade of [change.fadeInMs, change.fadeOutMs]) {
    if (fade !== undefined && (!Number.isFinite(fade) || fade < 0)) {
      throw new TimelineEditError('A fade cannot be negative.')
    }
  }
  const fadeLimit = (ms: number) => Math.round(Math.min(ms, clip.durationMs))
  const next: Clip = {
    ...clip,
    ...(change.muted !== undefined ? { muted: change.muted } : {}),
    ...(change.gain !== undefined ? { gain: change.gain } : {}),
    ...(change.fadeInMs !== undefined ? { fadeInMs: fadeLimit(change.fadeInMs) } : {}),
    ...(change.fadeOutMs !== undefined ? { fadeOutMs: fadeLimit(change.fadeOutMs) } : {})
  }
  return settle(
    replaceTrack(timeline, {
      ...track,
      clips: track.clips.map((item) => (item.id === clipId ? next : item))
    })
  )
}

// Changes a short's auto-ducking settings (see ./ducking.ts). Only the fields given change; the rest
// keep their stored or default values. Values outside the schema's ranges are refused. Returns the same
// timeline when nothing changes, so no history entry is made.
export function setDucking(timeline: Timeline, change: Partial<DuckingSettings>): Timeline {
  const current = duckingFor(timeline)
  const parsed = duckingSchema.safeParse({ ...current, ...change })
  if (!parsed.success) throw new TimelineEditError('Ducking settings are out of range.')
  const next = parsed.data
  if (
    timeline.ducking !== undefined &&
    next.amountDb === current.amountDb &&
    next.attackMs === current.attackMs &&
    next.releaseMs === current.releaseMs
  ) {
    return timeline
  }
  return { ...timeline, ducking: next }
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

// Changes one clip's transform (position, scale, stretch, rotation). The update gets the stored
// transform, so a caller can nudge or drag from what is stored when the edit runs. Refused on a locked
// track, like every clip edit.
export function updateClipTransform(
  timeline: Timeline,
  clipId: string,
  update: (transform: Transform) => Transform
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  const next = update(clip.transform)
  if (!(next.scale > 0) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) {
    throw new TimelineEditError(`Clip "${clipId}" got an invalid transform.`)
  }
  return replaceTrack(timeline, {
    ...track,
    clips: track.clips.map((item) => (item.id === clip.id ? { ...item, transform: next } : item))
  })
}

// Changes one clip's framing (the crop of a vertical short, see ./framing.ts). The update gets the
// stored framing, or a centred fill when the clip has none. Refused on a locked track.
export function updateClipFraming(
  timeline: Timeline,
  clipId: string,
  update: (framing: ClipFraming) => ClipFraming
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  const next = update(clip.framing ?? { ...CENTRED_FILL })
  const parsed = clipFramingSchema.safeParse(next)
  if (!parsed.success) {
    throw new TimelineEditError(`Clip "${clipId}" got an invalid framing.`)
  }
  return replaceTrack(timeline, {
    ...track,
    clips: track.clips.map((item) =>
      item.id === clip.id ? { ...item, framing: parsed.data } : item
    )
  })
}

// Moves one or more clips to startMs on a track, as one edit (Epic 07, #88). The moving clips keep
// their spacing: startMs is where the first clip's block starts. On the main track the block is
// inserted there: clips from that point onward shift right by the block's span, and the gap the block
// leaves behind stays where it was. An insert point inside another main clip snaps to that clip's
// nearer edge. Free layers take the clips where they are dropped and may overlap. A clip moves only to
// a track of its own kind (main and overlay video both count as video), and no move touches a locked
// track. Linked audio moves with its video clip: if the selection has both, the audio is left to the
// video clip, and linked audio alone cannot be moved.
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
  const movable = clipIds.filter((id) => {
    const owner = ownerOf(timeline, id)
    if (!owner) return true
    if (clipIds.includes(owner.id)) return false
    throw new TimelineEditError(
      'Linked audio moves with its video clip. Edit the video clip instead.'
    )
  })
  if (movable.length === 0) return timeline
  const moving = movable.map((id) => locate(timeline, id).clip)
  const sources = movable.map((id) => locate(timeline, id).track)
  const target = trackById(timeline, toTrackId)
  if (target.locked) throw new TimelineEditError(`Track "${target.id}" is locked.`)
  for (const source of sources) {
    if (source.locked) throw new TimelineEditError(`Track "${source.id}" is locked.`)
    if (source.kind !== target.kind) {
      throw new TimelineEditError('Clips can only move to a track of the same kind.')
    }
  }

  const movingIds = new Set(movable)
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
  return settle({ ...timeline, tracks })
}

// Splits every clip that strictly contains atMs, as one edit (Epic 07, #90). With selectedIds, only the
// selected clips are split; with none, every clip under atMs on an unlocked track is. Locked tracks are
// always skipped. A linked audio clip is split with its video clip, and selecting either one selects
// the pair. newId is called once per split, plus once more for the audio of a linked clip, in track
// order. Returns the same timeline object when nothing is under atMs, so the caller can tell there was
// nothing to do.
export function splitClipsAt(
  timeline: Timeline,
  atMs: number,
  selectedIds: readonly string[],
  newId: () => string
): Timeline {
  const targets: string[] = []
  for (const track of timeline.tracks) {
    if (track.locked) continue
    for (const clip of track.clips) {
      if (ownerOf(timeline, clip.id)) continue
      const selected =
        selectedIds.length === 0 ||
        selectedIds.includes(clip.id) ||
        (clip.linkedAudio !== undefined && selectedIds.includes(clip.linkedAudio))
      if (selected && clip.startMs < atMs && atMs < endOf(clip)) targets.push(clip.id)
    }
  }
  return targets.reduce((current, clipId) => {
    const clip = locate(current, clipId).clip
    return splitClip(current, clipId, atMs, newId(), clip.linkedAudio ? newId() : undefined)
  }, timeline)
}

// Removes several clips as one edit. A main track is left with a gap where each clip was. Clips on a
// locked track, and ids that no longer exist, are skipped. Linked audio is removed with its video clip,
// so it is skipped here. Returns the same timeline object when no clip was removed.
export function deleteClips(timeline: Timeline, clipIds: readonly string[]): Timeline {
  return [...new Set(clipIds)].reduce((current, clipId) => {
    if (ownerOf(current, clipId)) return current
    const found = trackHolding(current, clipId)
    if (!found || found.locked) return current
    return deleteClip(current, clipId)
  }, timeline)
}

// The most copies one loop may add. A clip much shorter than the short would otherwise add thousands.
export const MAX_LOOP_COPIES = 200

// Repeats a music clip on its own lane until untilMs, with a crossfade at each loop point, as one
// edit. Copies go after the original on the same track. Returns the same timeline when the clip
// already reaches untilMs. Only the Music lane takes loops.
export function loopFillClip(
  timeline: Timeline,
  clipId: string,
  untilMs: number,
  newId: () => string
): Timeline {
  const { track, clip } = locate(timeline, clipId)
  if (track.role !== 'music') throw new TimelineEditError('Loop to fill works on the Music lane.')
  if (!Number.isInteger(untilMs)) throw new TimelineEditError('A loop needs a whole length.')
  if (untilMs <= endOf(clip)) return timeline
  if ((untilMs - clip.startMs) / clip.durationMs > MAX_LOOP_COPIES) {
    throw new TimelineEditError('The clip would repeat too many times to fill this length.')
  }
  const { copies, transitions } = loopLayout(clip, untilMs, newId)
  const next = replaceTrack(timeline, { ...track, clips: [...track.clips, ...copies] })
  return { ...next, transitions: [...(timeline.transitions ?? []), ...transitions] }
}
