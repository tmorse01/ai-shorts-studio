// The editor's undo registry. Nothing selects a short yet, so there is no active history and undo
// and redo do nothing. The short editor (epic 02) sets the active id and loads each short.
import { createHistoryRegistry } from './historyRegistry'

export const editorHistory = createHistoryRegistry<object>({ createInitial: () => ({}) })
