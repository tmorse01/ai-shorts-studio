// Pure helpers for reviewing a footage plan (Epic 15, #139): the match request built from a script, the
// plan with only the lines the user accepted, and the short a script is attached to. No state or IPC here.
import type { AnalysisFile, ShotRange } from '@shared/analysis/analysis'
import type { AssemblyPlan } from '@shared/assembly/assemblyPlan'
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import type { Project, Script, Short } from '@shared/project/schema'
import type { SearchDoc } from '@shared/search/searchIndex'

export interface MatchRequestSources {
  script: Script
  project: Project
  docs: readonly SearchDoc[]
  shotsByMedia: Readonly<Record<string, ShotRange[]>>
}

/** The request for one script. Lines with no text are left out, so they are never matched. */
export function buildMatchRequest(sources: MatchRequestSources): FootageMatchRequest {
  const mediaNames: Record<string, string> = {}
  const durationsMs: Record<string, number> = {}
  for (const media of sources.project.media) {
    mediaNames[media.id] = media.fileName
    if (media.durationMs !== undefined) durationsMs[media.id] = media.durationMs
  }
  return {
    lines: sources.script.lines
      .filter((line) => line.text.trim() !== '')
      .map((line) => ({ lineId: line.id, text: line.text })),
    targetMs: null,
    docs: [...sources.docs],
    mediaNames,
    shots: { ...sources.shotsByMedia },
    durationsMs
  }
}

/** The shot ranges of every media item in an analysis file. Items without shots are left out. */
export function shotsByMediaOf(file: AnalysisFile | undefined): Record<string, ShotRange[]> {
  const shots: Record<string, ShotRange[]> = {}
  for (const [mediaId, record] of Object.entries(file?.records ?? {})) {
    if (record.shots) shots[mediaId] = record.shots
  }
  return shots
}

/** The plan with only the accepted lines. Rejected lines leave the timeline as they are. */
export function acceptedPlan(plan: AssemblyPlan, accepted: ReadonlySet<string>): AssemblyPlan {
  return { lines: plan.lines.filter((line) => accepted.has(line.lineId)) }
}

/** The short a script is attached to. Footage is applied to that short's timeline. */
export function attachedShort(project: Project, scriptId: string): Short | undefined {
  return project.shorts.find((short) => short.scriptId === scriptId)
}

/** The first unlocked video track of a short, which is where the footage lands. */
export function videoTrackId(short: Short): string | undefined {
  return short.timeline.tracks.find((track) => track.kind === 'video' && track.locked !== true)?.id
}
