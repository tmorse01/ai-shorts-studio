// Pure logic behind the media panel: sorting, selection with Ctrl and Shift, the display of durations,
// and the command that removes media from a project. Kept free of React so it is tested directly.
import type { MediaRef, Project } from '@shared/project/schema'
import type { Command } from '../history/historyStore'

export type MediaSortKey = 'name' | 'duration' | 'size'
export type SortDirection = 'asc' | 'desc'

// "m:ss" for a known duration, a dash while the probe has not reported one.
export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—'
  const totalSec = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = String(totalSec % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function compareBy(key: MediaSortKey, a: MediaRef, b: MediaRef): number {
  if (key === 'name') return a.fileName.localeCompare(b.fileName)
  if (key === 'size') return a.sizeBytes - b.sizeBytes
  return (a.durationMs ?? -1) - (b.durationMs ?? -1)
}

export function sortMedia(
  media: readonly MediaRef[],
  key: MediaSortKey,
  direction: SortDirection
): MediaRef[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...media].sort((a, b) => sign * compareBy(key, a, b))
}

export interface Selection {
  ids: string[]
  // The item a Shift-click extends from.
  anchor: string | null
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null }

export interface SelectModifiers {
  // Ctrl or Cmd: add or remove one item.
  additive?: boolean
  // Shift: select everything between the anchor and the clicked item.
  range?: boolean
}

// `order` is the items as they are on screen, so a range follows what the user sees.
export function selectItem(
  selection: Selection,
  id: string,
  modifiers: SelectModifiers,
  order: readonly string[]
): Selection {
  if (modifiers.range && selection.anchor !== null) {
    const from = order.indexOf(selection.anchor)
    const to = order.indexOf(id)
    if (from !== -1 && to !== -1) {
      const [low, high] = from < to ? [from, to] : [to, from]
      return { ids: order.slice(low, high + 1), anchor: selection.anchor }
    }
  }
  if (modifiers.additive) {
    const ids = selection.ids.includes(id)
      ? selection.ids.filter((selected) => selected !== id)
      : [...selection.ids, id]
    return { ids, anchor: id }
  }
  return { ids: [id], anchor: id }
}

// Removes media from the project. The files on disk are left alone.
export function removeMediaCommand(ids: readonly string[]): Command<Project> {
  return {
    label: ids.length === 1 ? 'Remove 1 file' : `Remove ${ids.length} files`,
    produce: (draft) => {
      for (let index = draft.media.length - 1; index >= 0; index -= 1) {
        if (ids.includes(draft.media[index]?.id ?? '')) draft.media.splice(index, 1)
      }
    }
  }
}
