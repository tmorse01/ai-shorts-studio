// Undoable command for a script line's narration (Epic 10, #114). Recording a line and generating a line both
// end here: the audio file joins the project's media (unless it is already listed) and the line's clip is
// placed at the line's position, replacing only the clip that line had. One undo restores the old clip and
// one redo brings the new one back.
import type { MediaRef, Project } from '@shared/project/schema'
import { IDENTITY_TRANSFORM, type Clip } from '@shared/timeline/timeline'
import { setLineNarrationClip } from '@shared/narration/lineNarration'
import type { NarrationSource } from '@shared/timeline/narration'
import type { Command } from '../history/historyStore'
import { timelineCommand } from '../timeline/timelineCommands'

export interface LineClipCommandInput {
  shortId: string
  scriptId: string
  lineId: string
  label: string
  now: string
  // Id for the new clip.
  clipId: string
  // Id for a Narration lane the short does not have yet.
  narrationTrackId: string
  // The audio file. Its id is used only when the project does not already list this file.
  media: Omit<MediaRef, 'id'> & { id: string }
  durationMs: number
  source: Exclude<NarrationSource, 'imported'>
  // The voice the audio was made with, for generated lines.
  voiceId?: string
  // The line's words.
  text: string
}

export function lineClipCommand(input: LineClipCommandInput): Command<Project> {
  return {
    label: input.label,
    produce: (draft) => {
      const script = draft.scripts.find((item) => item.id === input.scriptId)
      if (!script) throw new Error(`No script with id ${input.scriptId}`)
      const lineIds = script.lines.map((line) => line.id)
      if (!lineIds.includes(input.lineId))
        throw new Error(`The script has no line ${input.lineId}.`)

      // The speech cache reuses a file for the same voice and text, so the file may already be listed.
      const existing = draft.media.find(
        (item) => item.path === input.media.path && item.pathKind === input.media.pathKind
      )
      const mediaId = existing?.id ?? input.media.id
      if (!existing) draft.media.push({ ...input.media, id: mediaId })

      const clip: Clip = {
        id: input.clipId,
        mediaId,
        startMs: 0,
        durationMs: Math.max(1, Math.round(input.durationMs)),
        sourceInMs: 0,
        transform: { ...IDENTITY_TRANSFORM },
        narration: {
          source: input.source,
          scriptLineId: input.lineId,
          ...(input.voiceId ? { voiceId: input.voiceId } : {}),
          text: input.text
        }
      }
      timelineCommand(input.shortId, input.label, input.now, (timeline) =>
        setLineNarrationClip(timeline, {
          lineIds,
          lineId: input.lineId,
          clip,
          narrationTrackId: input.narrationTrackId
        })
      ).produce(draft)
    }
  }
}
