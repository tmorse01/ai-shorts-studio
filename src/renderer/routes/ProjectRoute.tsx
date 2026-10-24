import type { JSX } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { RoutePlaceholder } from './RoutePlaceholder'

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: ProjectPage
})

function ProjectPage(): JSX.Element {
  const { projectId } = useParams({ from: '/project/$projectId' })

  return (
    <RoutePlaceholder
      title="Project home"
      description={`Project ${projectId}. Its shorts list arrives with epic 02.`}
    />
  )
}
