// What the centre pane shows: the source clip being viewed (Source) or the short's preview (Short),
// and the In and Out marks on the source. Marks are view state, not project content, so they are
// not in the undo history and are cleared when a new clip opens.
import { createStore } from 'zustand/vanilla'
import { markedRange, markIn, markOut, NO_MARKS, type SourceMarks } from '@shared/media/sourceMarks'
import { playbackStore } from '../playback/playbackStore'

export type ViewMode = 'source' | 'short'

export interface SourceState extends SourceMarks {
  mode: ViewMode
  // The media item shown in Source view, or null when none is open.
  sourceId: string | null
  // True while the inline name prompt for a new moment is open.
  naming: boolean
}

export interface SourceActions {
  setMode: (mode: ViewMode) => void
  // Opens a clip in Source view and clears the marks left from the previous clip.
  openSource: (id: string) => void
  // Opens a clip with its In and Out marked, for a saved moment. The playhead moves to In.
  openRange: (id: string, inMs: number, outMs: number) => void
  markInAtPlayhead: () => void
  markOutAtPlayhead: () => void
  // Sets both marks to a range, such as the words a transcript selection covers.
  markRange: (startMs: number, endMs: number) => void
  clearMarks: () => void
  // Opens the name prompt for the marked range. Does nothing unless both marks are set.
  startNamingMoment: () => void
  cancelNamingMoment: () => void
  // Back to the short view with no clip open and no marks, for example when another project opens.
  reset: () => void
}

export type SourceStore = SourceState & SourceActions

export const sourceStore = createStore<SourceStore>()((set, get) => {
  // Marks only apply while a source is on screen.
  const canMark = () => get().mode === 'source' && get().sourceId !== null
  const playhead = () => playbackStore.getState()

  return {
    mode: 'short',
    sourceId: null,
    naming: false,
    ...NO_MARKS,
    setMode: (mode) => set({ mode, naming: false }),
    openSource: (id) => set({ mode: 'source', sourceId: id, naming: false, ...NO_MARKS }),
    openRange: (id, inMs, outMs) => {
      set({ mode: 'source', sourceId: id, naming: false, inMs, outMs })
      playbackStore.getState().seek(inMs)
    },
    markInAtPlayhead: () => {
      if (!canMark()) return
      set({ naming: false, ...markIn(get(), playhead().playheadMs, playhead().durationMs) })
    },
    markOutAtPlayhead: () => {
      if (!canMark()) return
      set({ naming: false, ...markOut(get(), playhead().playheadMs, playhead().durationMs) })
    },
    markRange: (startMs, endMs) => {
      if (!canMark()) return
      const durationMs = playhead().durationMs
      const withIn = markIn(get(), startMs, durationMs)
      set({ naming: false, ...markOut(withIn, endMs, durationMs) })
    },
    clearMarks: () => set({ naming: false, ...NO_MARKS }),
    startNamingMoment: () => {
      if (!canMark() || markedRange(get()) === null) return
      set({ naming: true })
    },
    cancelNamingMoment: () => set({ naming: false }),
    reset: () => set({ mode: 'short', sourceId: null, naming: false, ...NO_MARKS })
  }
})
