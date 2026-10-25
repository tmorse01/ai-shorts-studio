import {
  addCutTransition,
  detachAudio,
  removeTransition,
  setClipAudio,
  setClipLocked,
  swapClipAlternative
} from '@shared/timeline/edits'
import {
  DEFAULT_TRANSITION_MS,
  TRANSITION_KINDS,
  TRANSITION_LABELS,
  cutBefore
} from '@shared/timeline/transitions'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'
import type { DropdownMenuItem } from '@renderer/ui/DropdownMenu'
import { soundClipFor } from '../audio/clipSound'

// What the clip menu needs from the timeline pane: the edit runner, a new id, and the source length
// of a clip's media, for the transition lengths.
export interface ClipMenuContext {
  timeline: Timeline
  clip: Clip
  track: Track
  selectedIds: readonly string[]
  runEdit: (label: string, edit: (timeline: Timeline) => Timeline) => void
  newId: () => string
  clipSourceLength: (clip: Clip) => number | undefined
}

// The items of the clip menu for one clip, opened from a right-click or Shift+F10 on the clip. It
// offers the clip's actions only when the clip is the one selected and its track is unlocked. Every
// item is one undoable edit.
export function clipMenuItems(context: ClipMenuContext): DropdownMenuItem[] {
  const { timeline, clip, track, selectedIds, runEdit } = context
  if (track.locked || selectedIds.length !== 1 || selectedIds[0] !== clip.id) return []
  const items: DropdownMenuItem[] = []
  const audioTrack =
    timeline.tracks.find(
      (item) => item.kind === 'audio' && item.role === 'music' && !item.locked
    ) ?? timeline.tracks.find((item) => item.kind === 'audio' && !item.locked)
  if (track.kind === 'video' && clip.mediaId && !clip.linkedAudio && audioTrack) {
    const target = audioTrack
    items.push({
      label: 'Detach audio',
      onSelect: () => {
        runEdit('Detach audio', (current) =>
          detachAudio(current, clip.id, target.id, context.newId())
        )
      }
    })
  }
  const sound = soundClipFor(timeline, selectedIds)
  if (sound) {
    const label = sound.muted ? 'Unmute clip' : 'Mute clip'
    items.push({
      label,
      onSelect: () =>
        runEdit(label, (current) => setClipAudio(current, sound.id, { muted: !sound.muted }))
    })
  }
  if (clip.assembly) {
    clip.assembly.alternatives.forEach((_take, index) => {
      const label = `Swap to take ${index + 1}`
      items.push({
        label,
        onSelect: () => runEdit(label, (current) => swapClipAlternative(current, clip.id, index))
      })
    })
    const pinned = clip.locked === true
    const label = pinned ? 'Unlock clip' : 'Lock clip'
    items.push({
      label,
      onSelect: () => runEdit(label, (current) => setClipLocked(current, clip.id, !pinned))
    })
  }
  if (track.role === 'main') items.push(...cutMenuItems(context))
  return items
}

// The cut before a main-track clip: add a crossfade or a dip to black there at the default length
// (clamped to the handles), or remove the transition already on it.
function cutMenuItems(context: ClipMenuContext): DropdownMenuItem[] {
  const { timeline, clip, runEdit } = context
  const cut = cutBefore(timeline, clip.id)
  if (!cut) return []
  const existing = (timeline.transitions ?? []).find(
    (item) => item.fromClipId === cut.from.id && item.toClipId === clip.id
  )
  if (existing) {
    return [
      {
        label: 'Remove transition',
        onSelect: () =>
          runEdit('Remove transition', (current) => removeTransition(current, existing.id))
      }
    ]
  }
  return TRANSITION_KINDS.map((kind) => {
    const label = `Add ${TRANSITION_LABELS[kind].toLowerCase()} at cut`
    return {
      label,
      onSelect: () =>
        runEdit(label, (current) =>
          addCutTransition(
            current,
            context.newId(),
            clip.id,
            kind,
            DEFAULT_TRANSITION_MS,
            context.clipSourceLength
          )
        )
    }
  })
}
