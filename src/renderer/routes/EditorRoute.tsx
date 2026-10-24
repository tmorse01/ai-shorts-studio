import { useEffect, type JSX } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { EditorShell } from '@renderer/features/layout/EditorShell'
import { editorHistory } from '@renderer/features/history/editorHistory'
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

// The shell does not read the project or short yet: the project store arrives with epic 02. The page
// selects the short's undo history and restores its view state. Leaving a short saves that state, so
// switching shorts keeps each one's undo steps, playhead and zoom.
function EditorPage(): JSX.Element {
  const { shortId } = useParams({ strict: false })

  useEffect(() => {
    if (!shortId) return
    editorHistory.selection.getState().setActive(shortId)
    restoreShortViewState(shortId)
    return () => {
      captureShortViewState(shortId)
      editorHistory.selection.getState().setActive(null)
    }
  }, [shortId])

  return <EditorShell />
}
