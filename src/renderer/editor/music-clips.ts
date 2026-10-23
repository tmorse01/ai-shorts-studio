import type { MusicClip } from '../../shared/types'

/** A split closer than this to either end would leave a sliver, so it is refused. */
export const MIN_PIECE_SEC = 0.05

/** The clip a split or delete acts on: the selected one, or else the one under the playhead. */
export function musicClipAt(clips: MusicClip[], atSec: number): MusicClip | null {
  return clips.find((c) => atSec > c.startSec && atSec < c.startSec + c.lengthSec) ?? null
}

/**
 * Split a music clip at a point on the short's timeline. The left piece keeps the clip's id. The right
 * piece gets `newId` and carries on from the same place in the track. Returns null when the point is
 * too close to an end, or the clip is not in the list.
 */
export function splitMusicClip(
  clips: MusicClip[],
  id: string,
  atSec: number,
  newId: string
): { clips: MusicClip[]; rightId: string } | null {
  const target = clips.find((c) => c.id === id)
  if (!target) return null
  const local = atSec - target.startSec
  if (local < MIN_PIECE_SEC || local > target.lengthSec - MIN_PIECE_SEC) return null
  const left: MusicClip = { ...target, lengthSec: local }
  const right: MusicClip = {
    id: newId,
    assetId: target.assetId,
    startSec: atSec,
    trackStartSec: target.trackStartSec + local,
    lengthSec: target.lengthSec - local
  }
  return {
    clips: clips.flatMap((c) => (c.id === id ? [left, right] : [c])),
    rightId: newId
  }
}

export function removeMusicClip(clips: MusicClip[], id: string): MusicClip[] {
  return clips.filter((c) => c.id !== id)
}

/**
 * How far a clip may go on its lane: the end of the clip before it (or 0) and the start of the clip
 * after it (or no limit). Clips on one lane never overlap, so only the nearest neighbours matter.
 */
export function neighbourBounds(clip: MusicClip, others: MusicClip[]): { lo: number; hi: number } {
  let lo = 0
  let hi = Infinity
  const end = clip.startSec + clip.lengthSec
  for (const o of others) {
    if (o.startSec + o.lengthSec <= clip.startSec) lo = Math.max(lo, o.startSec + o.lengthSec)
    else if (o.startSec >= end) hi = Math.min(hi, o.startSec)
  }
  return { lo, hi }
}

/**
 * Move a group of clips along the lane by one delta. The group moves together, so the delta is limited by
 * whichever member reaches a limit first: the timeline's start, or a neighbour outside the group.
 */
export function moveMusicClips(clips: MusicClip[], ids: string[], deltaSec: number): MusicClip[] {
  const moving = new Set(ids)
  const group = clips.filter((c) => moving.has(c.id))
  const others = clips.filter((c) => !moving.has(c.id))
  let lo = -Infinity
  let hi = Infinity
  for (const g of group) {
    const b = neighbourBounds(g, others)
    lo = Math.max(lo, b.lo - g.startSec)
    hi = Math.min(hi, b.hi - (g.startSec + g.lengthSec))
  }
  if (lo > hi) return clips
  const d = Math.min(Math.max(deltaSec, lo), hi)
  return clips.map((c) => (moving.has(c.id) ? { ...c, startSec: c.startSec + d } : c))
}

/**
 * Limit a trim so the moved edge stops at the neighbour on that side. Returns the delta to use with
 * `resizeMusicClip`.
 */
export function clampResizeDelta(clip: MusicClip, edge: 'start' | 'end', deltaSec: number, others: MusicClip[]): number {
  const b = neighbourBounds(clip, others)
  if (edge === 'start') return Math.max(deltaSec, b.lo - clip.startSec)
  return Math.min(deltaSec, b.hi - (clip.startSec + clip.lengthSec))
}

/**
 * Move one edge of a music clip. The end edge changes how much of the track plays, up to the end of the
 * track. The start edge moves the clip's start on the timeline and its in-point in the track together, so
 * the music under the clip stays where it was. Neither edge can pass the track's start or end, or the
 * timeline's start, or leave a sliver.
 */
export function resizeMusicClip(clip: MusicClip, edge: 'start' | 'end', deltaSec: number, trackSec: number): MusicClip {
  if (trackSec <= 0) return clip
  if (edge === 'end') {
    const longest = trackSec - clip.trackStartSec
    const lengthSec = Math.min(Math.max(clip.lengthSec + deltaSec, MIN_PIECE_SEC), longest)
    return { ...clip, lengthSec }
  }
  const earliest = -Math.min(clip.trackStartSec, clip.startSec)
  const latest = clip.lengthSec - MIN_PIECE_SEC
  const d = Math.min(Math.max(deltaSec, earliest), latest)
  return {
    ...clip,
    startSec: clip.startSec + d,
    trackStartSec: clip.trackStartSec + d,
    lengthSec: clip.lengthSec - d
  }
}
