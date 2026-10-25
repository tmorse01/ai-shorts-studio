// Caption style presets as project-level commands (Epic 11, #121). Each one is a Command<Project>, so the
// project history can undo it. A preset edit changes the project's list, so every short that uses the
// preset shows the change. Picking a preset for a short only changes that short.
import {
  captionPresetSchema,
  DEFAULT_CAPTION_PRESETS,
  type CaptionPreset
} from '@shared/captions/captionPreset'
import type { Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { markEdited } from '../shorts/shortCommands'

// A partial change to a preset. Fields left out keep their value. Setting `stroke` to undefined removes
// the outline.
export type CaptionPresetChange = Partial<Omit<CaptionPreset, 'id'>>

// The project's own presets, or copies of the shipped defaults when the project has none yet. Writes
// through the draft so the first edit materialises the list in the project.
function presetsForEdit(draft: Project): CaptionPreset[] {
  if (!draft.captionPresets || draft.captionPresets.length === 0) {
    draft.captionPresets = DEFAULT_CAPTION_PRESETS.map((preset) => ({ ...preset }))
  }
  return draft.captionPresets
}

// Edits one preset in the project's list. The merged preset is checked with the schema first, so a bad
// value throws and leaves the project as it was.
export function updateCaptionPresetCommand(
  presetId: string,
  change: CaptionPresetChange,
  label = 'Edit caption style',
  mergeKey?: string
): Command<Project> {
  return {
    label,
    mergeKey,
    produce: (draft) => {
      const presets = presetsForEdit(draft)
      const index = presets.findIndex((preset) => preset.id === presetId)
      if (index === -1) throw new Error('That caption preset is no longer in the project.')
      const next = captionPresetSchema.parse({ ...presets[index], ...change })
      presets[index] = next
    }
  }
}

export interface SaveCaptionPresetInput {
  // The new preset's id, and its name as the user typed it.
  id: string
  label: string
  // The preset whose look is copied.
  source: CaptionPreset
  // When given, the short uses the new preset from this same step.
  shortId?: string
  now: string
}

// Saves a copy of a preset under a new name, and optionally makes it the short's preset. One undo step.
export function saveCaptionPresetCommand(input: SaveCaptionPresetInput): Command<Project> {
  const label = input.label.trim()
  return {
    label: 'Save caption preset',
    produce: (draft) => {
      if (label === '') throw new Error('A caption preset needs a name.')
      const presets = presetsForEdit(draft)
      const preset = captionPresetSchema.parse({ ...input.source, id: input.id, label })
      presets.push(preset)
      if (input.shortId !== undefined) {
        const short = draft.shorts.find((item) => item.id === input.shortId)
        if (!short) throw new Error('That short is no longer in the project.')
        short.captionPresetId = preset.id
        markEdited(short, input.now)
      }
    }
  }
}

// Sets the preset a short uses by default. Blocks with their own style keep it.
export function setShortCaptionPresetCommand(
  shortId: string,
  presetId: string,
  now: string
): Command<Project> {
  return {
    label: 'Change caption preset',
    produce: (draft) => {
      const short = draft.shorts.find((item) => item.id === shortId)
      if (!short) throw new Error('That short is no longer in the project.')
      short.captionPresetId = presetId
      markEdited(short, now)
    }
  }
}
