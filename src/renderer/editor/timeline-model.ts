import {
  MAX_SEGMENTS_PER_SHORT,
  MIN_SEGMENT_SEC,
  cutEnd,
  cutLength,
  type Segment,
  type TimelineCut
} from '../../shared/timeline'
import type { MusicClip } from '../../shared/types'

/** A video cut shorter than this would be a sliver, so a split that makes one is refused. */
export const MIN_CUT_PIECE_SEC = 0.5

/**
 * Split a cut at a point on the short's timeline. Both pieces keep the footage they had, and stay where
 * they were. Returns null when the point is too close to an end, or the short already has the most cuts.
 */
export function splitCut(
  cuts: TimelineCut[],
  index: number,
  outputSec: number
): { cuts: TimelineCut[]; rightIndex: number } | null {
  const cut = cuts[index]
  if (!cut || cuts.length >= MAX_SEGMENTS_PER_SHORT) return null
  const local = outputSec - cut.atSec
  const len = cutLength(cut)
  if (local < MIN_CUT_PIECE_SEC || len - local < MIN_CUT_PIECE_SEC) return null
  const at = cut.startSec + local
  const left: TimelineCut = { startSec: cut.startSec, endSec: at, atSec: cut.atSec }
  const right: TimelineCut = { startSec: at, endSec: cut.endSec, atSec: outputSec }
  return {
    cuts: [...cuts.slice(0, index), left, right, ...cuts.slice(index + 1)],
    rightIndex: index + 1
  }
}

/**
 * The room a cut has on the timeline: the end of the cut before it (or 0), and the start of the cut after it
 * (or no limit). Cuts never overlap, so only the nearest neighbours matter.
 */
export function laneRoom(cuts: TimelineCut[], index: number): { left: number; right: number } {
  const cut = cuts[index]
  const end = cutEnd(cut)
  let left = 0
  let right = Infinity
  cuts.forEach((o, i) => {
    if (i === index) return
    if (cutEnd(o) <= cut.atSec) left = Math.max(left, cutEnd(o))
    else if (o.atSec >= end) right = Math.min(right, o.atSec)
  })
  return { left, right }
}

/**
 * Move a cut along the timeline without changing its footage. It stops at its neighbours and at the end of
 * the short. Blank space between cuts is left alone.
 */
export function moveCut(cuts: TimelineCut[], index: number, deltaSec: number, lengthSec: number): TimelineCut[] {
  const cut = cuts[index]
  const room = laneRoom(cuts, index)
  const len = cutLength(cut)
  const lo = room.left
  const hi = Math.min(room.right - len, lengthSec - len)
  if (hi < lo) return cuts
  const atSec = Math.min(Math.max(cut.atSec + deltaSec, lo), hi)
  return cuts.map((c, i) => (i === index ? { ...c, atSec } : c))
}

/**
 * Trim one edge of a cut. The other edge stays where it is on the timeline: trimming the start moves the
 * cut's start and its place together, so its end does not shift, and trimming the end leaves the start.
 * Trims stop at the footage's ends, at the cut's minimum length, at its neighbours and at the short's end.
 */
export function trimCut(
  cuts: TimelineCut[],
  index: number,
  edge: 'start' | 'end',
  deltaSec: number,
  sourceDurationSec: number,
  lengthSec: number
): TimelineCut[] {
  const cut = cuts[index]
  const room = laneRoom(cuts, index)
  const len = cutLength(cut)
  if (edge === 'start') {
    // The start can go back only as far as the footage, the timeline's start and the cut before it allow.
    const lo = Math.max(-cut.startSec, -cut.atSec, room.left - cut.atSec)
    const hi = len - MIN_SEGMENT_SEC
    const d = Math.min(Math.max(deltaSec, lo), hi)
    return cuts.map((c, i) => (i === index ? { ...c, startSec: c.startSec + d, atSec: c.atSec + d } : c))
  }
  const lo = -(len - MIN_SEGMENT_SEC)
  const hi = Math.min(sourceDurationSec - cut.endSec, room.right - cutEnd(cut), lengthSec - cutEnd(cut))
  const d = Math.min(Math.max(deltaSec, lo), hi)
  return cuts.map((c, i) => (i === index ? { ...c, endSec: c.endSec + d } : c))
}

/** Remove the cuts at these indexes. A short always keeps at least one cut, so deleting every cut does nothing. */
export function deleteCuts(cuts: TimelineCut[], indexes: number[]): TimelineCut[] {
  const removing = new Set(indexes)
  const remaining = cuts.filter((_, i) => !removing.has(i))
  return remaining.length === 0 ? cuts : remaining
}

/**
 * Where a new cut goes: the first free space that fits it, starting at `preferAt` (the playhead) when that
 * space is free. Returns null when no space on the timeline fits the cut.
 */
export function placeNewCut(cuts: TimelineCut[], seg: Segment, lengthSec: number, preferAt: number): TimelineCut | null {
  const len = cutLength(seg)
  const sorted = [...cuts].sort((a, b) => a.atSec - b.atSec)
  const gaps: Array<[number, number]> = []
  let cursor = 0
  for (const c of sorted) {
    if (c.atSec > cursor) gaps.push([cursor, c.atSec])
    cursor = Math.max(cursor, cutEnd(c))
  }
  if (lengthSec > cursor) gaps.push([cursor, lengthSec])
  for (const [a, b] of gaps) {
    const at = Math.max(a, preferAt)
    if (at + len <= b) return { ...seg, atSec: at }
  }
  for (const [a, b] of gaps) {
    if (b - a >= len) return { ...seg, atSec: a }
  }
  return null
}

/**
 * Every time a moving edge may snap to: the timeline's start and end, the edges of each cut and music clip
 * that is not being dragged, and the playhead.
 */
export function snapTargets(cuts: TimelineCut[], music: MusicClip[], playheadSec: number | null, lengthSec: number): number[] {
  const targets = [0, lengthSec]
  for (const c of cuts) targets.push(c.atSec, cutEnd(c))
  for (const c of music) targets.push(c.startSec, c.startSec + c.lengthSec)
  if (playheadSec !== null) targets.push(playheadSec)
  return targets
}
