// Pure helpers for the editor's timeline pane: the short's target range and which footage is offline.
// The pane itself reads them from the open project, so these stay testable without React.
import { DEFAULT_SHORT_DEFAULTS, type MediaRef, type Project } from '@shared/project/schema'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'

export interface TargetRangeMs {
  minMs: number
  maxMs: number
}

// The short's target length in milliseconds: the project defaults merged with the short's overrides.
// With no open project or no such short, the default target applies.
export function targetRangeMs(project: Project | undefined, shortId: string): TargetRangeMs {
  const short = project?.shorts.find((item) => item.id === shortId)
  const settings =
    project && short
      ? effectiveShortSettings(project.defaults, short.overrides)
      : DEFAULT_SHORT_DEFAULTS
  return {
    minMs: Math.round(settings.targetLength.minSec * 1000),
    maxMs: Math.round(settings.targetLength.maxSec * 1000)
  }
}

// The absolute path of a media file, as the main process reports missing files.
export function absoluteMediaPath(folderPath: string, ref: MediaRef): string {
  if (ref.pathKind === 'absolute') return ref.path
  return `${folderPath}/${ref.path}`
}

// The ids of the media items whose files are among the missing paths from media:stat.
export function offlineMediaIds(
  folderPath: string,
  media: readonly MediaRef[],
  missing: readonly string[]
): string[] {
  const missingSet = new Set(missing)
  return media
    .filter((ref) => missingSet.has(absoluteMediaPath(folderPath, ref)))
    .map((ref) => ref.id)
}
