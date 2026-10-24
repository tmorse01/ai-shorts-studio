// Transform edits from the canvas gizmo as commands in the project history. A drag or a run of arrow
// presses shares a mergeKey, so the whole gesture is one undo step.
import type { Project } from '@shared/project/schema'
import type { Transform } from '@shared/timeline/timeline'
import { updateClipTransform } from '@shared/timeline/edits'
import type { Command } from '../history/historyStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { timelineCommand } from '../timeline/timelineCommands'

export function transformCommand(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  transform: (current: Transform) => Transform,
  now: string = new Date().toISOString()
): Command<Project> {
  return timelineCommand(
    shortId,
    label,
    now,
    (timeline) => updateClipTransform(timeline, clipId, transform),
    mergeKey
  )
}

export function applyTransformEdit(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  transform: (current: Transform) => Transform
): void {
  applyProjectCommand(transformCommand(shortId, clipId, label, mergeKey, transform))
}
