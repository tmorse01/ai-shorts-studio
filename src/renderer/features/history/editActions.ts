// Undo and redo for what the editor shows: the active short's history, or the project history when
// no short is open. The keyboard shortcuts and the top bar buttons both call these, so they always
// do the same thing.
import { useStore } from 'zustand'
import { useProjectStore } from '@renderer/features/project/useProjectStore'
import {
  canRedoProjectEdit,
  canUndoProjectEdit,
  redoProjectEdit,
  undoProjectEdit
} from '@renderer/features/shorts/shortActions'
import { createHistoryStore } from './historyStore'
import { editorHistory } from './editorHistory'

export function undoEdit(): boolean {
  const short = editorHistory.active()
  if (short) return short.getState().undo()
  return undoProjectEdit()
}

export function redoEdit(): boolean {
  const short = editorHistory.active()
  if (short) return short.getState().redo()
  return redoProjectEdit()
}

// Used only as a stand-in subscription target when no short is open. It never records anything.
const NO_SHORT_HISTORY = createHistoryStore<object>({})

/**
 * Whether undo and redo have anything to do right now. Reads the active short's history when a
 * short is open, otherwise the project history. Re-renders when the open short or project changes.
 */
export function useEditAvailability(): { canUndo: boolean; canRedo: boolean } {
  const activeId = useStore(editorHistory.selection, (s) => s.activeId)
  const project = useProjectStore((s) => s.current?.project)
  const shortHistory = activeId === null ? null : editorHistory.get(activeId)
  const shortPast = useStore(shortHistory ?? NO_SHORT_HISTORY, (s) => s.past.length)
  const shortFuture = useStore(shortHistory ?? NO_SHORT_HISTORY, (s) => s.future.length)

  if (shortHistory) return { canUndo: shortPast > 0, canRedo: shortFuture > 0 }
  // The project history is read at render. Every project edit replaces the project, which
  // re-renders this hook through the project selector above.
  if (project === undefined) return { canUndo: false, canRedo: false }
  return { canUndo: canUndoProjectEdit(), canRedo: canRedoProjectEdit() }
}
