// UI layout state for the editor: which left tool is active, and each pane's size and collapsed
// state. One small store per domain; actions mutate through Immer drafts. The layout is saved and
// restored through the IPC bridge (see layoutPersistence.ts), never browser storage.
import { createStore } from 'zustand/vanilla'
import { immer } from 'zustand/middleware/immer'
import type { LeftTool, PaneId } from '@shared/layout'

export type { LeftTool, PaneId }

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
  setPaneCollapsed: (pane: PaneId, collapsed: boolean) => void
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
      setPaneCollapsed: (pane, collapsed) =>
        set((draft) => {
          draft.panes[pane].collapsed = collapsed
        }),
      setPaneSize: (pane, size) =>
        set((draft) => {
          draft.panes[pane].size = size
        })
    }))
  )
}
