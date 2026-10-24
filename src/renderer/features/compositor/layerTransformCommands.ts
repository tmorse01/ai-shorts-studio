// Transform and framing edits from the canvas gizmo as commands in the project history. A drag or a
// run of arrow presses shares a mergeKey, so the whole gesture is one undo step. A drag passes
// GESTURE_MERGE_WINDOW_MS, so a pause mid-drag does not split it.
import type { Project } from '@shared/project/schema'
import type { ClipFraming } from '@shared/timeline/framing'
import type { Transform } from '@shared/timeline/timeline'
import { updateClipFraming, updateClipTransform } from '@shared/timeline/edits'
import type { Command } from '../history/historyStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { timelineCommand } from '../timeline/timelineCommands'

// Holding a drag can take any length of time. The merge key is unique to one drag, so an unlimited
// window only ever folds that drag's own moves together.
export const GESTURE_MERGE_WINDOW_MS = Number.POSITIVE_INFINITY

export function transformCommand(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  transform: (current: Transform) => Transform,
  now: string = new Date().toISOString(),
  mergeWindowMs?: number
): Command<Project> {
  return timelineCommand(
    shortId,
    label,
    now,
    (timeline) => updateClipTransform(timeline, clipId, transform),
    mergeKey,
    mergeWindowMs
  )
}

export function applyTransformEdit(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  transform: (current: Transform) => Transform,
  mergeWindowMs?: number
): void {
  applyProjectCommand(
    transformCommand(shortId, clipId, label, mergeKey, transform, undefined, mergeWindowMs)
  )
}

export function framingCommand(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  framing: (current: ClipFraming) => ClipFraming,
  now: string = new Date().toISOString(),
  mergeWindowMs?: number
): Command<Project> {
  return timelineCommand(
    shortId,
    label,
    now,
    (timeline) => updateClipFraming(timeline, clipId, framing),
    mergeKey,
    mergeWindowMs
  )
}

export function applyFramingEdit(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  framing: (current: ClipFraming) => ClipFraming,
  mergeWindowMs?: number
): void {
  applyProjectCommand(
    framingCommand(shortId, clipId, label, mergeKey, framing, undefined, mergeWindowMs)
  )
}
