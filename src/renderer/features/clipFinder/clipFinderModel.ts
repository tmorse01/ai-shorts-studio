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

export type ClipFinderTab = 'suggested' | 'highlights' | 'topics' | 'emotional'

export const CLIP_FINDER_TABS: readonly { value: ClipFinderTab; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'topics', label: 'Topics' },
  { value: 'emotional', label: 'Emotional' }
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

export interface ClipFinderSource {
  mediaId: string
  moments: readonly Moment[]
  drafts: readonly MomentSuggestion[]
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
    createdBy: moment.createdBy
  }))
  const drafts: ClipFinderItem[] = source.drafts.map((draft) => ({
    kind: 'draft',
    key: momentSuggestionKey(draft),
    mediaId: source.mediaId,
    name: draft.name,
    inMs: draft.inMs,
    outMs: draft.outMs,
    ...(draft.note ? { note: draft.note } : {}),
    ...(draft.score === undefined ? {} : { score: draft.score })
  }))
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

// Words that mark a moment as emotional. The tab is a keyword match on the name and note, so it
// stays empty for clips whose moments say nothing emotional.
const EMOTION_PATTERN =
  /\b(laugh\w*|funny|joy\w*|happ\w*|cry\w*|tears?|tearful|angr\w*|fear\w*|scar\w*|surpris\w*|shock\w*|excit\w*|sad\w*|grie\w*|tense|heartfelt|touching|moving|emotion\w*|hope\w*)\b/i

export function isEmotional(item: ClipFinderItem): boolean {
  if (item.kind === 'tag') return false
  return EMOTION_PATTERN.test(`${item.name} ${item.note ?? ''}`)
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
    case 'emotional':
      return items.filter(isEmotional)
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
    scoreLabel:
      item.kind === 'draft' && item.score !== undefined ? scoreLabel(item.score) : undefined,
    summary: item.note
  }
}

/** A score out of 100, clamped to the range. */
export function scoreLabel(score: number): string {
  const whole = Math.min(100, Math.max(0, Math.round(score)))
  return `${whole}/100`
}
