// Checks a short before its export starts (Epic 17, #153): offline footage, an empty short, and a short
// longer than its target. Pure: the caller says which media is offline, and the export panel shows the
// result before anything is queued. A blocking issue has no continue option.
import type { TargetLength } from '../project/schema'
import type { Timeline } from '../timeline/timeline'
import { timelineDurationMs } from '../timeline/resolveFrame'

export type PreflightIssueKind = 'offline' | 'empty' | 'overTarget'

export interface PreflightIssue {
  kind: PreflightIssueKind
  shortId: string
  shortName: string
  /** True when the export cannot run at all, so the user may only close the check. */
  blocking: boolean
  message: string
}

export interface PreflightShort {
  id: string
  name: string
  timeline: Timeline
  /** The short's effective target length (project defaults with the short's overrides). */
  targetLength: TargetLength
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1)
}

// The issues for one short. `offlineMediaIds` holds the ids of media files that are missing on disk.
export function preflightShort(
  short: PreflightShort,
  offlineMediaIds: ReadonlySet<string>
): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const base = { shortId: short.id, shortName: short.name }
  const durationMs = timelineDurationMs(short.timeline)

  if (durationMs === 0) {
    issues.push({ ...base, kind: 'empty', blocking: true, message: 'Has no clips to export.' })
    return issues
  }

  let offlineClips = 0
  for (const track of short.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.mediaId && offlineMediaIds.has(clip.mediaId)) offlineClips += 1
    }
  }
  if (offlineClips > 0) {
    issues.push({
      ...base,
      kind: 'offline',
      blocking: false,
      message: `${offlineClips} ${offlineClips === 1 ? 'clip uses' : 'clips use'} footage that is offline. The export may fail.`
    })
  }

  const maxMs = short.targetLength.maxSec * 1000
  if (durationMs > maxMs) {
    issues.push({
      ...base,
      kind: 'overTarget',
      blocking: false,
      message: `Runs ${seconds(durationMs)} s, over the ${short.targetLength.maxSec} s target.`
    })
  }
  return issues
}

// The issues for every short in an export, in the order given.
export function preflightShorts(
  shorts: readonly PreflightShort[],
  offlineMediaIds: ReadonlySet<string>
): PreflightIssue[] {
  return shorts.flatMap((short) => preflightShort(short, offlineMediaIds))
}

// Whether the user may continue past these issues. Any blocking issue stops the export.
export function canContinueExport(issues: readonly PreflightIssue[]): boolean {
  return !issues.some((issue) => issue.blocking)
}
