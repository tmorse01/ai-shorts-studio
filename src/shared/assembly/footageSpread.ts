// Spreads footage across the scripts of one batch (Epic 16, #146). A cut that an earlier script in the batch
// already uses is a used range. With reuse off, candidates that overlap a used range are tried last, so the
// matcher picks fresh footage when there is any. Pure, so the penalty is tested without the API.
import type { AssemblyPlan } from './assemblyPlan'

/** A stretch of one media item's source, in milliseconds, that a cut already uses. */
export interface UsedRange {
  mediaId: string
  startMs: number
  endMs: number
}

/** The source range of every cut in a plan. */
export function usedRangesOfPlan(plan: AssemblyPlan): UsedRange[] {
  return plan.lines.flatMap((line) =>
    line.cuts.map((cut) => ({ mediaId: cut.sourceId, startMs: cut.inMs, endMs: cut.outMs }))
  )
}

/** Whether a source range of a media item overlaps any used range of the same item. */
export function overlapsUsed(
  mediaId: string,
  startMs: number,
  endMs: number,
  used: readonly UsedRange[]
): boolean {
  return used.some(
    (range) => range.mediaId === mediaId && range.startMs < endMs && startMs < range.endMs
  )
}

/**
 * Moves the candidates that overlap used footage behind the fresh ones. The order inside each group is
 * kept, so the search ranking still decides among equals. Nothing is dropped: when every candidate is
 * used, the list comes back unchanged.
 */
export function spreadCandidates<T extends { mediaId: string; startMs: number; endMs: number }>(
  candidates: readonly T[],
  used: readonly UsedRange[]
): T[] {
  if (used.length === 0) return [...candidates]
  const fresh: T[] = []
  const reused: T[] = []
  for (const candidate of candidates) {
    if (overlapsUsed(candidate.mediaId, candidate.startMs, candidate.endMs, used)) {
      reused.push(candidate)
    } else {
      fresh.push(candidate)
    }
  }
  return [...fresh, ...reused]
}
