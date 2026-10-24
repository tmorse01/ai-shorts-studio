// Edits the project defaults that new shorts copy. Existing shorts keep their own overrides and
// their copied settings, so only `project.defaults` changes. The change is a Command<Project>, so
// the project history can undo it.
import { targetLengthSchema, type Project, type ShortDefaults } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

// A partial change. Fields left out keep their current value.
export type ProjectDefaultsChange = Partial<ShortDefaults>

// Throws with the schema's message when the resulting target length is not a valid range.
export function validateTargetLength(minSec: number, maxSec: number): string | null {
  const result = targetLengthSchema.safeParse({ minSec, maxSec })
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check the target length.')
}

export function updateProjectDefaultsCommand(change: ProjectDefaultsChange): Command<Project> {
  return {
    label: 'Edit project defaults',
    produce: (draft) => {
      if (change.targetLength) {
        const parsed = targetLengthSchema.parse(change.targetLength)
        draft.defaults.targetLength = { ...parsed }
      }
      if (change.platform !== undefined) draft.defaults.platform = change.platform
      if (change.safeZones !== undefined) draft.defaults.safeZones = change.safeZones
    }
  }
}
