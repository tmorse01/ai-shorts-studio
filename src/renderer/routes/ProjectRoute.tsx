import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { OfflineBanner } from '@renderer/features/project/OfflineBanner'
import { ProjectHeader } from '@renderer/features/project/ProjectHeader'
import { ShortsGrid } from '@renderer/features/shorts/ShortsGrid'
import styles from './ProjectRoute.module.css'

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: ProjectPage
})

// Project home: header, offline footage warning, and the Footage, Shorts and Scripts sections.
// Footage and Scripts are empty until epics 03 and 14 fill them.
function ProjectPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <ProjectHeader />
      <OfflineBanner />
      <section aria-label="Footage" className={styles.section}>
        <EmptyState title="No footage yet" description="Import clips to start cutting shorts." />
      </section>
      <ShortsGrid />
      <section aria-label="Scripts" className={styles.section}>
        <EmptyState title="No scripts yet" description="Scripts arrive with a later epic." />
      </section>
    </main>
  )
}
