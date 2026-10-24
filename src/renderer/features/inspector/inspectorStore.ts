// The inspector's state: the current selection type, the open tab and each section's collapsed
// state. Components read it through selectors. Collapsed state is per section id, so a section keeps
// its state whenever its selection type is shown again.
import { createStore } from 'zustand'
import type { ClipAudioChange } from '@shared/timeline/edits'
import type { ClipFraming } from '@shared/timeline/framing'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import { defaultTabFor, type InspectorTab, type SelectionType } from './inspectorModel'

// The sound of the one selected clip, for the clip audio section (Epic 07, #91). The timeline pane
// publishes it. apply runs an edit on that clip as one history entry; calls with the same mergeKey fold
// into one entry, so a volume drag is one undo step.
export interface AudioTarget {
  clipId: string
  muted: boolean
  gain: number
  apply: (label: string, change: ClipAudioChange, mergeKey?: string) => void
}

// The one selected video clip, for the video clip section (Epic 08, #96). The timeline pane publishes
// it. apply runs an edit as one history entry; calls with the same mergeKey fold into one entry. The
// linked audio is the clip's sound when it has one, or null when the sound is detached.
export interface VideoClipTarget {
  clip: Clip
  linkedAudio: Clip | null
  apply: (label: string, edit: (timeline: Timeline) => Timeline, mergeKey?: string) => void
}

// The framing of the one selected fill-framed clip, for the pan section (Epic 09, #105). framing is the
// stored framing, or a centred fill. apply runs an edit on that clip as one history entry.
export interface FramingTarget {
  clipId: string
  framing: ClipFraming
  apply: (label: string, edit: (framing: ClipFraming) => ClipFraming) => void
}

export interface InspectorState {
  selectionType: SelectionType
  tab: InspectorTab
  collapsed: Record<string, boolean>
  audioTarget: AudioTarget | null
  videoTarget: VideoClipTarget | null
  framingTarget: FramingTarget | null
}

export interface InspectorActions {
  // Changing the selection type moves the tab to the one it opens. The same type keeps the tab.
  setSelectionType: (selectionType: SelectionType) => void
  setTab: (tab: InspectorTab) => void
  toggleSection: (sectionId: string) => void
  setAudioTarget: (target: AudioTarget | null) => void
  setVideoTarget: (target: VideoClipTarget | null) => void
  setFramingTarget: (target: FramingTarget | null) => void
}

export type InspectorStore = InspectorState & InspectorActions

export function createInspectorStore() {
  return createStore<InspectorStore>()((set, get) => ({
    selectionType: 'short',
    tab: defaultTabFor('short'),
    collapsed: {},
    audioTarget: null,
    videoTarget: null,
    framingTarget: null,
    setAudioTarget: (audioTarget) => set({ audioTarget }),
    setVideoTarget: (videoTarget) => set({ videoTarget }),
    setFramingTarget: (framingTarget) => set({ framingTarget }),
    setSelectionType: (selectionType) => {
      if (selectionType === get().selectionType) return
      set({ selectionType, tab: defaultTabFor(selectionType) })
    },
    setTab: (tab) => set({ tab }),
    toggleSection: (sectionId) =>
      set((state) => ({
        collapsed: { ...state.collapsed, [sectionId]: !state.collapsed[sectionId] }
      }))
  }))
}

export const inspectorStore = createInspectorStore()
