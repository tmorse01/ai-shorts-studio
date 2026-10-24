// Snapping for timeline drags (Epic 07, #88). Pure functions: the pane picks the snap points and the
// threshold, and these return where a dragged block should land.
import type { Timeline } from './timeline'

export interface SnapResult {
  startMs: number
  // The point the block snapped to, or null when nothing was close enough.
  snappedMs: number | null
}

// Snaps a block's start or end to the nearest point within thresholdMs. Either edge can snap; the
// start is moved so the snapped edge lands on the point.
export function snapStart(
  startMs: number,
  durationMs: number,
  points: readonly number[],
  thresholdMs: number
): SnapResult {
  // Each edge of the block, with how far the start moves when that edge lands on a point.
  const edges = [
    { edgeMs: startMs, offset: 0 },
    { edgeMs: startMs + durationMs, offset: durationMs }
  ]
  const hits = edges.flatMap(({ edgeMs, offset }) =>
    points
      .map((point) => ({ point, offset, distance: Math.abs(edgeMs - point) }))
      .filter((hit) => hit.distance <= thresholdMs)
  )
  if (hits.length === 0) return { startMs, snappedMs: null }
  hits.sort((a, b) => a.distance - b.distance)
  const best = hits[0]
  return { startMs: Math.max(0, best.point - best.offset), snappedMs: best.point }
}

// The points a drag snaps to: the timeline start, the playhead, and every clip edge that is not
// being dragged. The dragged clips are left out so they do not snap to their own edges.
export function snapPoints(
  timeline: Timeline,
  excludeClipIds: readonly string[],
  playheadMs: number
): number[] {
  const excluded = new Set(excludeClipIds)
  const points = new Set<number>([0, playheadMs])
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (excluded.has(clip.id)) continue
      points.add(clip.startMs)
      points.add(clip.startMs + clip.durationMs)
    }
  }
  return [...points]
}

// Snaps one edge (a trim handle's position) to the nearest point within thresholdMs. Returns the edge
// unchanged when no point is close enough.
export function snapEdge(edgeMs: number, points: readonly number[], thresholdMs: number): number {
  let best: number | null = null
  let bestDistance = thresholdMs
  for (const point of points) {
    const distance = Math.abs(edgeMs - point)
    if (distance <= bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best ?? edgeMs
}
