import type { JSX } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { RoutePlaceholder } from './RoutePlaceholder'

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId/short/$shortId',
  component: EditorPage
})

function EditorPage(): JSX.Element {
  const { projectId, shortId } = useParams({ from: '/project/$projectId/short/$shortId' })

  return (
    <RoutePlaceholder
      title="Short editor"
      description={`Short ${shortId} in project ${projectId}. The editor arrives with epic 03.`}
    />
  )
}
