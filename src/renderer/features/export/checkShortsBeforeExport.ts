// Runs the pre-flight check for the shorts about to export (Epic 17, #153). It asks main which footage is
// missing on disk, then applies the pure rules in src/shared/export/exportPreflight.ts. If the check
// cannot reach main, footage is treated as online so a broken check never blocks an export.
import type { MediaRef, Project } from '@shared/project/schema'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'
import {
  preflightShorts,
  type PreflightIssue,
  type PreflightShort
} from '@shared/export/exportPreflight'

// The absolute path of a media file, as main checks it. Mirrors the offline banner's rule.
function absolutePath(folderPath: string, ref: MediaRef): string {
  if (ref.pathKind === 'absolute') return ref.path
  return `${folderPath}/${ref.path}`
}

export async function checkShortsBeforeExport(
  folderPath: string,
  project: Project,
  shortIds: readonly string[]
): Promise<PreflightIssue[]> {
  const shorts = project.shorts.filter((short) => shortIds.includes(short.id))
  const media = new Map(project.media.map((ref) => [ref.id, ref]))
  const usedIds = new Set<string>()
  for (const short of shorts) {
    for (const track of short.timeline.tracks) {
      for (const clip of track.clips) if (clip.mediaId) usedIds.add(clip.mediaId)
    }
  }
  const refs = [...usedIds].flatMap((id) => {
    const ref = media.get(id)
    return ref ? [ref] : []
  })

  const offline = new Set<string>()
  if (refs.length > 0) {
    const paths = refs.map((ref) => absolutePath(folderPath, ref))
    const result = await window.api.invoke('media:stat', { paths })
    if (result.ok) {
      const missing = new Set(result.data.missing)
      for (const ref of refs) {
        if (missing.has(absolutePath(folderPath, ref))) offline.add(ref.id)
      }
    }
  }

  const checked: PreflightShort[] = shorts.map((short) => ({
    id: short.id,
    name: short.name,
    timeline: short.timeline,
    targetLength: effectiveShortSettings(project.defaults, short.overrides).targetLength
  }))
  return preflightShorts(checked, offline)
}
