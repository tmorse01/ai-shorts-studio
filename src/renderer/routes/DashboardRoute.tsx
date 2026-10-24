import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { DashboardGallery } from '@renderer/features/dashboard/DashboardGallery'
import { rootRoute } from './rootRoute'

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage
})

function DashboardPage(): JSX.Element {
  return <DashboardGallery />
}
