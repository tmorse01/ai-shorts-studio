import type { JSX } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { EditorShell } from '@renderer/features/layout/EditorShell'
import { useProjectStore } from '@renderer/features/project/useProjectStore'
import { EMPTY_TIMELINE } from '@renderer/features/preview/previewFrame'
import { rootRoute } from './rootRoute'

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId/short/$shortId',
  component: EditorPage
})

// The open short's timeline feeds the preview. A short that is not in the open project shows an empty one.
function EditorPage(): JSX.Element {
  const { shortId } = useParams({ strict: false })
  const timeline = useProjectStore(
    (state) => state.current?.project.shorts.find((short) => short.id === shortId)?.timeline
  )
  return <EditorShell timeline={timeline ?? EMPTY_TIMELINE} />
}
