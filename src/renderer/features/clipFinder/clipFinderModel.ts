// The Clip Finder list for one clip: its saved moments (hand-marked or accepted from AI), the open AI
// drafts (moments and tag suggestions the user has not accepted or dismissed yet), and the filter and tab
// that narrow them. Pure, so the list, the tabs and the row facts are tested without the DOM.
import {
  momentSuggestionKey,
  tagSuggestionKey,
  type MomentSuggestion
} from '@shared/analysis/suggestions'
import type { Moment } from '@shared/project/schema'
import { formatDuration } from '../media/mediaView'

export type ClipFinderFilter = 'all' | 'mine' | 'ai'

export const CLIP_FINDER_FILTERS: readonly { value: ClipFinderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'ai', label: 'AI suggested' }
]

export type ClipFinderTab = 'suggested' | 'highlights' | 'topics'

export const CLIP_FINDER_TABS: readonly { value: ClipFinderTab; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'topics', label: 'Topics' }
]

export type ClipFinderItem =
  | {
      kind: 'moment'
      key: string
      mediaId: string
      momentId: string
      name: string
      inMs: number
      outMs: number
      note?: string
      tagNames: string[]
      createdBy: 'user' | 'ai'
      score?: number
    }
  | {
      // An open AI moment. It becomes a normal moment only when accepted.
      kind: 'draft'
      key: string
      mediaId: string
      name: string
      inMs: number
      outMs: number
      note?: string
      score?: number
    }
  | {
      // An open AI tag suggestion. Accepting it adds the tag to the clip.
      kind: 'tag'
      key: string
      mediaId: string
      name: string
    }

/** A draft the user changed before accepting it. Dismissing still uses the draft's own key. */
export interface DraftEdit {
  name: string
  inMs: number
  outMs: number
  note?: string
}

/** The text in the draft editor: names and times in seconds, as typed. */
export interface DraftEditInput {
  name: string
  inSec: string
  outSec: string
  note: string
}

export interface ClipFinderSource {
  mediaId: string
  moments: readonly Moment[]
  drafts: readonly MomentSuggestion[]
  /** Edits to open drafts, keyed by the draft's key. */
  draftEdits?: ReadonlyMap<string, DraftEdit>
  tagDrafts: readonly string[]
  /** The name of a tag id, for the chips on saved moments. */
  tagNameOf: (tagId: string) => string | undefined
}

// Tag suggestions first, then saved moments and drafts in source order.
export function clipFinderItems(source: ClipFinderSource): ClipFinderItem[] {
  const tags: ClipFinderItem[] = source.tagDrafts.map((name) => ({
    kind: 'tag',
    key: tagSuggestionKey(name),
    mediaId: source.mediaId,
    name
  }))
  const moments: ClipFinderItem[] = source.moments.map((moment) => ({
    kind: 'moment',
    key: `moment:${moment.id}`,
    mediaId: source.mediaId,
    momentId: moment.id,
    name: moment.name,
    inMs: moment.inMs,
    outMs: moment.outMs,
    ...(moment.note ? { note: moment.note } : {}),
    tagNames: moment.tags
      .map((id) => source.tagNameOf(id))
      .filter((name): name is string => name !== undefined),
    createdBy: moment.createdBy,
    ...(moment.score === undefined ? {} : { score: moment.score })
  }))
  const drafts: ClipFinderItem[] = source.drafts.map((draft) => {
    const key = momentSuggestionKey(draft)
    const edit = source.draftEdits?.get(key)
    const note = edit ? edit.note : draft.note
    return {
      kind: 'draft',
      key,
      mediaId: source.mediaId,
      name: edit?.name ?? draft.name,
      inMs: edit?.inMs ?? draft.inMs,
      outMs: edit?.outMs ?? draft.outMs,
      ...(note ? { note } : {}),
      ...(draft.score === undefined ? {} : { score: draft.score })
    }
  })
  const ranged = [...moments, ...drafts].sort((a, b) => rangeStart(a) - rangeStart(b))
  return [...tags, ...ranged]
}

function rangeStart(item: ClipFinderItem): number {
  return item.kind === 'tag' ? 0 : item.inMs
}

/** All: everything. Mine: moments the user marked by hand. AI suggested: open drafts, open tags and AI moments. */
export function filterClipFinderItems(
  items: readonly ClipFinderItem[],
  filter: ClipFinderFilter
): ClipFinderItem[] {
  if (filter === 'all') return [...items]
  if (filter === 'mine') {
    return items.filter((item) => item.kind === 'moment' && item.createdBy === 'user')
  }
  return items.filter((item) => item.kind !== 'moment' || item.createdBy === 'ai')
}

/** The items a tab shows. Suggested is everything; the other tabs narrow it. */
export function filterClipFinderTab(
  items: readonly ClipFinderItem[],
  tab: ClipFinderTab
): ClipFinderItem[] {
  switch (tab) {
    case 'suggested':
      return [...items]
    case 'highlights':
      return items.filter((item) => item.kind !== 'tag')
    case 'topics':
      return items.filter(
        (item) => item.kind === 'tag' || (item.kind === 'moment' && item.tagNames.length > 0)
      )
  }
}

/** The rows on screen: the filter applied first, then the tab. */
export function visibleClipFinderItems(
  items: readonly ClipFinderItem[],
  filter: ClipFinderFilter,
  tab: ClipFinderTab
): ClipFinderItem[] {
  return filterClipFinderTab(filterClipFinderItems(items, filter), tab)
}

/** A drafted moment or a tag suggestion: still an AI suggestion, not yet accepted or dismissed. */
export function isOpenSuggestion(item: ClipFinderItem): boolean {
  return item.kind !== 'moment'
}

export interface ClipRowFacts {
  /** The length of the range, for the thumbnail badge. Absent for a tag. */
  durationLabel: string | undefined
  /** The In and Out timecodes of the range. Absent for a tag. */
  rangeLabel: string | undefined
  /** "82/100", or absent when the suggestion has no score. */
  scoreLabel: string | undefined
  /** A one-line summary: the note, or a fixed line for a tag. */
  summary: string | undefined
}

export function clipRowFacts(item: ClipFinderItem): ClipRowFacts {
  if (item.kind === 'tag') {
    return {
      durationLabel: undefined,
      rangeLabel: undefined,
      scoreLabel: undefined,
      summary: 'Tag suggestion'
    }
  }
  return {
    durationLabel: formatDuration(item.outMs - item.inMs),
    rangeLabel: `${formatDuration(item.inMs)} to ${formatDuration(item.outMs)}`,
    scoreLabel: item.score === undefined ? undefined : scoreLabel(item.score),
    summary: item.note
  }
}

/** A score out of 100, clamped to the range. */
export function scoreLabel(score: number): string {
  const whole = Math.min(100, Math.max(0, Math.round(score)))
  return `${whole}/100`
}

/** Splits the editor's text into a draft edit. Times are seconds, and Out must come after In. */
export function draftEditFromInput(
  input: DraftEditInput
): { ok: true; edit: DraftEdit } | { ok: false; error: string } {
  const name = input.name.trim()
  if (name === '') return { ok: false, error: 'Give the clip a name.' }
  const inMs = secondsToMs(input.inSec)
  const outMs = secondsToMs(input.outSec)
  if (inMs === undefined || outMs === undefined) {
    return { ok: false, error: 'In and Out must be times in seconds, such as 12.5.' }
  }
  if (outMs <= inMs) return { ok: false, error: 'Out must come after In.' }
  const note = input.note.trim()
  return { ok: true, edit: { name, inMs, outMs, ...(note ? { note } : {}) } }
}

/** The editor's starting text for a draft. */
export function draftEditInputOf(item: {
  name: string
  inMs: number
  outMs: number
  note?: string
}): DraftEditInput {
  return {
    name: item.name,
    inSec: String(item.inMs / 1000),
    outSec: String(item.outMs / 1000),
    note: item.note ?? ''
  }
}

function secondsToMs(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const seconds = Number(trimmed)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.round(seconds * 1000)
}

/** The resolution label for a video, such as "1080p" (the shorter side). */
export function resolutionLabel(video: { width: number; height: number }): string {
  return `${Math.min(video.width, video.height)}p`
}
