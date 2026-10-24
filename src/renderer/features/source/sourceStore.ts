// What the centre pane shows: the source clip being viewed (Source) or the short's preview (Short),
// and the In and Out marks on the source. Marks are view state, not project content, so they are
// not in the undo history and are cleared when a new clip opens.
import { createStore } from 'zustand/vanilla'
import { markIn, markOut, NO_MARKS, type SourceMarks } from '@shared/media/sourceMarks'
import { playbackStore } from '../playback/playbackStore'

export type ViewMode = 'source' | 'short'

export interface SourceState extends SourceMarks {
  mode: ViewMode
  // The media item shown in Source view, or null when none is open.
  sourceId: string | null
}

export interface SourceActions {
  setMode: (mode: ViewMode) => void
  // Opens a clip in Source view and clears the marks left from the previous clip.
  openSource: (id: string) => void
  markInAtPlayhead: () => void
  markOutAtPlayhead: () => void
  clearMarks: () => void
}

export type SourceStore = SourceState & SourceActions

export const sourceStore = createStore<SourceStore>()((set, get) => {
  // Marks only apply while a source is on screen.
  const canMark = () => get().mode === 'source' && get().sourceId !== null
  const playhead = () => playbackStore.getState()

  return {
    mode: 'short',
    sourceId: null,
    ...NO_MARKS,
    setMode: (mode) => set({ mode }),
    openSource: (id) => set({ mode: 'source', sourceId: id, ...NO_MARKS }),
    markInAtPlayhead: () => {
      if (!canMark()) return
      set(markIn(get(), playhead().playheadMs, playhead().durationMs))
    },
    markOutAtPlayhead: () => {
      if (!canMark()) return
      set(markOut(get(), playhead().playheadMs, playhead().durationMs))
    },
    clearMarks: () => set(NO_MARKS)
  }
})
