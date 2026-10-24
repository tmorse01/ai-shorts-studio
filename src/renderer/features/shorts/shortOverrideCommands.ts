// Per-short overrides as commands in the project history (Epic 05). An override is stored on the
// short, so the short's effective settings change for that short only. Resetting removes the override,
// which falls back to the project default.
import {
  targetLengthSchema,
  shortPlatformSchema,
  type Project,
  type ShortOverrides
} from '@shared/project/schema'
import { SHORT_OVERRIDE_FIELDS, type ShortOverrideField } from '@shared/shorts/shortSettings'
import type { Command } from '../history/historyStore'
import { markEdited } from './shortCommands'

// Sets the given overrides in one step. Values are validated with the schema before anything changes,
// so a bad target length throws and leaves the project as it was.
export function updateShortOverridesCommand(
  shortId: string,
  change: ShortOverrides,
  now: string,
  label = 'Change short settings'
): Command<Project> {
  const targetLength = change.targetLength
    ? { ...targetLengthSchema.parse(change.targetLength) }
    : undefined
  const platform =
    change.platform !== undefined ? shortPlatformSchema.parse(change.platform) : undefined
  const safeZones = change.safeZones
  return {
    label,
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error(`No short with id ${shortId}`)
      if (targetLength) short.overrides.targetLength = { ...targetLength }
      if (platform !== undefined) short.overrides.platform = platform
      if (safeZones !== undefined) short.overrides.safeZones = safeZones
      markEdited(short, now)
    }
  }
}

// Removes one override, so the short uses the project default for that field again.
export function resetShortOverrideCommand(
  shortId: string,
  field: ShortOverrideField,
  now: string
): Command<Project> {
  if (!SHORT_OVERRIDE_FIELDS.includes(field)) throw new Error(`Unknown override ${field}`)
  return {
    label: 'Reset to project default',
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error(`No short with id ${shortId}`)
      delete short.overrides[field]
      markEdited(short, now)
    }
  }
}
