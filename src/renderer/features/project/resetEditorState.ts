// Drops the undo steps and view state of the project that was open. Called once another project has
// replaced it, or the open project has been closed, so nothing from the old project carries over.
import { layerSelectionStore } from '../compositor/layerSelectionStore'
import { editorHistory } from '../history/editorHistory'
import { clearProjectHistory } from '../shorts/shortActions'
import { sourceStore } from '../source/sourceStore'

export function resetEditorState(): void {
  clearProjectHistory()
  editorHistory.clear()
  layerSelectionStore.getState().select(null)
  sourceStore.getState().reset()
}
