import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { DashboardGallery } from '@renderer/features/dashboard/DashboardGallery'
import { DashboardNav } from '@renderer/features/dashboard/DashboardNav'
import { rootRoute } from './rootRoute'
import styles from './DashboardRoute.module.css'

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage
})

// The dashboard is the only screen with the slim left nav (DESIGN.md §12).
function DashboardPage(): JSX.Element {
  return (
    <div className={styles.shell}>
      <DashboardNav />
      <div className={styles.content}>
        <DashboardGallery />
      </div>
    </div>
  )
}
