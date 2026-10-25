// Undoable commands for the narration clip section (Epic 10, #116). Field edits are one timeline edit each.
// Regenerating adds the new audio file to the project's media and points the clip at it, as one command, so
// one undo puts the old audio back and redo brings the new one back.
import type { MediaRef, Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'
import { timelineCommand } from '../timeline/timelineCommands'
import {
  replaceNarrationAudio,
  updateClipNarration,
  type NarrationChange
} from './narrationClipEdits'

export interface NarrationFieldsCommandInput {
  shortId: string
  clipId: string
  label: string
  now: string
  change: NarrationChange
}

export function narrationFieldsCommand(input: NarrationFieldsCommandInput): Command<Project> {
  return timelineCommand(input.shortId, input.label, input.now, (timeline) =>
    updateClipNarration(timeline, input.clipId, input.change)
  )
}

export interface RegenerateNarrationInput {
  shortId: string
  clipId: string
  now: string
  // The new audio file. Its id is used only when the project does not already list this file.
  media: MediaRef
  durationMs: number
  voiceId: string
  text: string
}

export function regenerateNarrationCommand(input: RegenerateNarrationInput): Command<Project> {
  return {
    label: 'Regenerate narration',
    produce: (draft) => {
      // The speech cache reuses a file for the same voice and text, so the file may already be listed.
      const existing = draft.media.find(
        (item) => item.path === input.media.path && item.pathKind === input.media.pathKind
      )
      const mediaId = existing?.id ?? input.media.id
      if (!existing) draft.media.push({ ...input.media, id: mediaId })
      timelineCommand(input.shortId, 'Regenerate narration', input.now, (timeline) =>
        replaceNarrationAudio(timeline, input.clipId, {
          mediaId,
          durationMs: input.durationMs,
          voiceId: input.voiceId,
          text: input.text
        })
      ).produce(draft)
    }
  }
}
