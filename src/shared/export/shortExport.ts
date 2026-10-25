// What an export does to a short's record when it succeeds (Epic 17, #152, fields from #67). Pure: the
// main process applies it when the export file is in place.
import type { Project } from '../project/schema'

// The short with its export fields set: status Exported, the export time, and no edit since export.
// Returns null when the project has no short with that id.
export function setShortExported(
  project: Project,
  shortId: string,
  exportedAt: string
): Project | null {
  const index = project.shorts.findIndex((short) => short.id === shortId)
  if (index === -1) return null
  const shorts = project.shorts.map((short, position) =>
    position === index
      ? {
          ...short,
          status: 'exported' as const,
          exportedAt,
          editedSinceExport: false,
          updatedAt: exportedAt
        }
      : short
  )
  return { ...project, shorts, updatedAt: exportedAt }
}
