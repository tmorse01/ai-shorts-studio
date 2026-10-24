// Keyboard shortcuts for cutting and closing gaps on the timeline (Epic 07, #90). Each one runs a pure
// edit through the pane's edit function, so it lands in history as one undoable command. The pane
// registers these in the shortcut registry while it is mounted.
import { closeGap, deleteClips, splitClipsAt } from '@shared/timeline/edits'
import type { Gap } from '@shared/timeline/gaps'
import type { Timeline } from '@shared/timeline/timeline'
import type { ShortcutDefinition } from '../shortcuts/shortcutRegistry'

export interface TimelineShortcutContext {
  timeline: Timeline
  selectedIds: readonly string[]
  gap: Gap | null
  playheadMs: number
  newId: () => string
  // Applies an edit as one history entry. Returns false when it changes nothing or is refused.
  edit: (label: string, edit: (timeline: Timeline) => Timeline) => boolean
  clearSelection: () => void
}

// Closes one gap. Shared by the Delete shortcut and the gap's menu.
export function closeGapEdit(gap: Gap): (timeline: Timeline) => Timeline {
  return (timeline) => closeGap(timeline, gap.trackId, gap.startMs)
}

export function timelineShortcuts(
  readContext: () => TimelineShortcutContext
): ShortcutDefinition[] {
  return [
    {
      id: 'timeline.split',
      keys: ['s'],
      label: 'Split the selected clips at the playhead, or every clip under it',
      group: 'Timeline',
      run: () => {
        const context = readContext()
        context.edit('Split clip', (timeline) =>
          splitClipsAt(timeline, context.playheadMs, context.selectedIds, context.newId)
        )
      }
    },
    {
      id: 'timeline.delete',
      keys: ['delete', 'backspace'],
      label: 'Delete the selected clips, or close the selected gap',
      group: 'Timeline',
      run: () => {
        const context = readContext()
        if (context.gap) {
          if (context.edit('Close gap', closeGapEdit(context.gap))) context.clearSelection()
          return
        }
        if (context.selectedIds.length === 0) return
        const ids = [...context.selectedIds]
        if (context.edit('Delete clips', (timeline) => deleteClips(timeline, ids))) {
          context.clearSelection()
        }
      }
    }
  ]
}
