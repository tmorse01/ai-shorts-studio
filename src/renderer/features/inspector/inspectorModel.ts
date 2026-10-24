// The inspector's pure rules: which tab a selection opens, which sections a tab shows, and what the
// current selection is. No DOM and no React, so the rules are tested directly (Epic 08, #94).
import type { ComponentType } from 'react'
import type { Gap } from '@shared/timeline/gaps'
import type { Timeline, TrackKind } from '@shared/timeline/timeline'

export const INSPECTOR_TABS = ['video', 'audio', 'ai', 'transcript'] as const
export type InspectorTab = (typeof INSPECTOR_TABS)[number]

export const INSPECTOR_TAB_LABELS: Record<InspectorTab, string> = {
  video: 'Video',
  audio: 'Audio',
  ai: 'AI',
  transcript: 'Transcript'
}

// The tabs the inspector shows. The transcript tab belongs to the source view only, so it is
// listed only while the centre pane shows a source clip.
export function visibleInspectorTabs(sourceView: boolean): readonly InspectorTab[] {
  return sourceView ? INSPECTOR_TABS : INSPECTOR_TABS.filter((tab) => tab !== 'transcript')
}

// What the inspector is editing. 'short' is the empty selection: the short's own properties.
export const SELECTION_TYPES = ['short', 'video-clip', 'audio-clip', 'transition', 'gap'] as const
export type SelectionType = (typeof SELECTION_TYPES)[number]

/**
 * A section registered with the inspector. Epics 10 to 13 add their sections here. `selections`
 * says which selection types show it. `tab` says which top tab holds it. `Component` renders its
 * body; the framework wraps it in the pane error boundary.
 */
export interface InspectorSectionDef {
  id: string
  title: string
  tab: InspectorTab
  // Lower numbers appear first within a tab.
  order: number
  selections: readonly SelectionType[]
  Component: ComponentType
}

// The tab a selection opens. Video clips, transitions and the short itself open Video; audio clips
// open Audio. Changing selection type moves the tab; re-selecting the same type keeps the tab.
export function defaultTabFor(selection: SelectionType): InspectorTab {
  return selection === 'audio-clip' ? 'audio' : 'video'
}

// Sections for one tab and selection type, in order. Sections with no match are left out.
export function sectionsFor(
  sections: readonly InspectorSectionDef[],
  selection: SelectionType,
  tab: InspectorTab
): InspectorSectionDef[] {
  return sections
    .filter((section) => section.tab === tab && section.selections.includes(selection))
    .sort((a, b) => a.order - b.order)
}

// The selection type for the timeline's current selection. A gap is its own type. A clip selection
// takes the kind of its first clip's track. No clips and no gap is the short.
export function selectionTypeFor(
  timeline: Timeline,
  clipIds: readonly string[],
  gap: Gap | null,
  transitionId: string | null = null
): SelectionType {
  if (gap) return 'gap'
  if (
    transitionId !== null &&
    (timeline.transitions ?? []).some((item) => item.id === transitionId)
  ) {
    return 'transition'
  }
  const firstId = clipIds[0]
  if (firstId === undefined) return 'short'
  const kind = trackKindOfClip(timeline, firstId)
  if (kind === 'audio') return 'audio-clip'
  if (kind === 'video') return 'video-clip'
  return 'short'
}

function trackKindOfClip(timeline: Timeline, clipId: string): TrackKind | undefined {
  for (const track of timeline.tracks) {
    if (track.clips.some((clip) => clip.id === clipId)) return track.kind
  }
  return undefined
}

// The selection header's text (Epic 08, #99): the selection count and type, such as "3 audio clips".
// The short has no selection to count, so it reads "Short".
export function selectionHeaderFor(selection: SelectionType, count: number): string {
  switch (selection) {
    case 'short':
      return 'Short'
    case 'gap':
      return 'Gap'
    case 'transition':
      return 'Transition'
    case 'video-clip':
      return count === 1 ? 'Video clip' : `${count} video clips`
    case 'audio-clip':
      return count === 1 ? 'Audio clip' : `${count} audio clips`
  }
}
