// UI layout state for the editor: which left tool is active, and each pane's size and collapsed
// state. Example store for the state pattern: one small store per domain, actions mutate through
// Immer drafts. Persistence through the IPC bridge arrives with the layout task.
import { createStore } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'

export type PaneId = 'left' | 'right' | 'bottom'

export type LeftTool =
  'media' | 'ai-clip-finder' | 'captions' | 'audio' | 'transitions' | 'effects' | 'export'

export interface PaneState {
  size: number
  collapsed: boolean
}

export interface UiState {
  leftTool: LeftTool
  panes: Record<PaneId, PaneState>
}

export interface UiActions {
  setLeftTool: (tool: LeftTool) => void
  togglePane: (pane: PaneId) => void
  setPaneSize: (pane: PaneId, size: number) => void
}

export type UiStore = UiState & UiActions

export const DEFAULT_UI_STATE: UiState = {
  leftTool: 'media',
  panes: {
    left: { size: 320, collapsed: false },
    right: { size: 300, collapsed: false },
    bottom: { size: 240, collapsed: false }
  }
}

export function createUiStore(initial: UiState = DEFAULT_UI_STATE) {
  return createStore<UiStore>()(
    immer((set) => ({
      ...structuredClone(initial),
      setLeftTool: (tool) =>
        set((draft) => {
          draft.leftTool = tool
        }),
      togglePane: (pane) =>
        set((draft) => {
          draft.panes[pane].collapsed = !draft.panes[pane].collapsed
        }),
      setPaneSize: (pane, size) =>
        set((draft) => {
          draft.panes[pane].size = size
        })
    }))
  )
}
