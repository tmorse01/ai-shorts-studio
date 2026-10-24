// The inspector's state: the current selection type, the open tab and each section's collapsed
// state. Components read it through selectors. Collapsed state is per section id, so a section keeps
// its state whenever its selection type is shown again.
import { createStore } from 'zustand'
import { defaultTabFor, type InspectorTab, type SelectionType } from './inspectorModel'

export interface InspectorState {
  selectionType: SelectionType
  tab: InspectorTab
  collapsed: Record<string, boolean>
}

export interface InspectorActions {
  // Changing the selection type moves the tab to the one it opens. The same type keeps the tab.
  setSelectionType: (selectionType: SelectionType) => void
  setTab: (tab: InspectorTab) => void
  toggleSection: (sectionId: string) => void
}

export type InspectorStore = InspectorState & InspectorActions

export function createInspectorStore() {
  return createStore<InspectorStore>()((set, get) => ({
    selectionType: 'short',
    tab: defaultTabFor('short'),
    collapsed: {},
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
