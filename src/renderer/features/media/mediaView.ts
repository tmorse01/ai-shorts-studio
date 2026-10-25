// Pure logic behind the media panel: sorting, selection with Ctrl and Shift, the display of durations,
// and the command that removes media from a project. Kept free of React so it is tested directly.
import type { MediaKind, MediaRef, Project } from '@shared/project/schema'
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

// What the media panel filters by. An empty list or blank query means no filter on that field.
// Tags match when a file has any of the chosen tags. Durations are in seconds; a file with no known
// duration does not match a duration bound.
export interface MediaFilter {
  query: string
  kinds: MediaKind[]
  tagIds: string[]
  minDurationSec?: number
  maxDurationSec?: number
}

export const EMPTY_MEDIA_FILTER: MediaFilter = { query: '', kinds: [], tagIds: [] }

// How many filter criteria are set, for the Filter button's count. Each type, each tag and the duration
// range count once. The search text is not a filter criterion: it has its own box.
export function activeFilterCount(filter: MediaFilter): number {
  const duration = filter.minDurationSec !== undefined || filter.maxDurationSec !== undefined
  return filter.kinds.length + filter.tagIds.length + (duration ? 1 : 0)
}

export function isMediaFilterActive(filter: MediaFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.kinds.length > 0 ||
    filter.tagIds.length > 0 ||
    filter.minDurationSec !== undefined ||
    filter.maxDurationSec !== undefined
  )
}

// Keeps the media that pass every active part of the filter, in the order given.
export function filterMedia(media: readonly MediaRef[], filter: MediaFilter): MediaRef[] {
  const query = filter.query.trim().toLowerCase()
  const minMs = filter.minDurationSec === undefined ? undefined : filter.minDurationSec * 1000
  const maxMs = filter.maxDurationSec === undefined ? undefined : filter.maxDurationSec * 1000
  return media.filter((ref) => {
    if (query !== '' && !ref.fileName.toLowerCase().includes(query)) return false
    if (filter.kinds.length > 0 && !filter.kinds.includes(ref.kind)) return false
    if (filter.tagIds.length > 0) {
      const tags = ref.tagIds ?? []
      if (!filter.tagIds.some((tagId) => tags.includes(tagId))) return false
    }
    if (minMs !== undefined || maxMs !== undefined) {
      if (ref.durationMs === undefined) return false
      if (minMs !== undefined && ref.durationMs < minMs) return false
      if (maxMs !== undefined && ref.durationMs > maxMs) return false
    }
    return true
  })
}

// Removes media from the project, with the moments saved from it. The files on disk are left alone.
export function removeMediaCommand(ids: readonly string[]): Command<Project> {
  return {
    label: ids.length === 1 ? 'Remove 1 file' : `Remove ${ids.length} files`,
    produce: (draft) => {
      for (let index = draft.media.length - 1; index >= 0; index -= 1) {
        if (ids.includes(draft.media[index]?.id ?? '')) draft.media.splice(index, 1)
      }
      draft.moments = draft.moments.filter((moment) => !ids.includes(moment.mediaId))
    }
  }
}
