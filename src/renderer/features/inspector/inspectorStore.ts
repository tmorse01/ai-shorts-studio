// The inspector's state: the current selection type, the open tab and each section's collapsed
// state. Components read it through selectors. Collapsed state is per section id, so a section keeps
// its state whenever its selection type is shown again.
import { createStore } from 'zustand'
import type { ClipAudioChange } from '@shared/timeline/edits'
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

export interface InspectorState {
  selectionType: SelectionType
  tab: InspectorTab
  collapsed: Record<string, boolean>
  audioTarget: AudioTarget | null
}

export interface InspectorActions {
  // Changing the selection type moves the tab to the one it opens. The same type keeps the tab.
  setSelectionType: (selectionType: SelectionType) => void
  setTab: (tab: InspectorTab) => void
  toggleSection: (sectionId: string) => void
  setAudioTarget: (target: AudioTarget | null) => void
}

export type InspectorStore = InspectorState & InspectorActions

export function createInspectorStore() {
  return createStore<InspectorStore>()((set, get) => ({
    selectionType: 'short',
    tab: defaultTabFor('short'),
    collapsed: {},
    audioTarget: null,
    setAudioTarget: (audioTarget) => set({ audioTarget }),
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
