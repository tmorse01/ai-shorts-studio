import { useEffect, type JSX } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { EditorShell } from '@renderer/features/layout/EditorShell'
import { useProjectStore } from '@renderer/features/project/useProjectStore'
import { EMPTY_TIMELINE } from '@renderer/features/preview/previewFrame'
import { editorHistory } from '@renderer/features/history/editorHistory'
import { layerSelectionStore } from '@renderer/features/compositor/layerSelectionStore'
import {
  captureShortViewState,
  restoreShortViewState
} from '@renderer/features/shorts/shortViewState'
import { rootRoute } from './rootRoute'

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId/short/$shortId',
  component: EditorPage
})

// The open short's timeline feeds the preview; a short not in the open project shows an empty one.
// The page also selects the short's undo history and restores its view state. Leaving a short saves
// that state, so switching shorts keeps each one's undo steps, playhead and zoom.
function EditorPage(): JSX.Element {
  const { shortId } = useParams({ strict: false })
  const timeline = useProjectStore(
    (state) => state.current?.project.shorts.find((short) => short.id === shortId)?.timeline
  )

  useEffect(() => {
    if (!shortId) return
    editorHistory.selection.getState().setActive(shortId)
    restoreShortViewState(shortId)
    return () => {
      captureShortViewState(shortId)
      editorHistory.selection.getState().setActive(null)
      layerSelectionStore.getState().select(null)
    }
  }, [shortId])

  return <EditorShell timeline={timeline ?? EMPTY_TIMELINE} shortId={shortId} />
}
