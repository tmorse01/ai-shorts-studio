import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { OfflineBanner } from '@renderer/features/project/OfflineBanner'
import { ProjectHeader } from '@renderer/features/project/ProjectHeader'
import { ShortsGrid } from '@renderer/features/shorts/ShortsGrid'
import { ScriptsSection } from '@renderer/features/scripts/ScriptsSection'
import styles from './ProjectRoute.module.css'

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: ProjectPage
})

// Project home: header, offline footage warning, and the Footage, Shorts and Scripts sections.
// Footage is empty until epic 03 fills it.
function ProjectPage(): JSX.Element {
  return (
    <main className={styles.page}>
      <ProjectHeader />
      <OfflineBanner />
      <section aria-label="Footage" className={styles.section}>
        <EmptyState title="No footage yet" description="Import clips to start cutting shorts." />
      </section>
      <ShortsGrid />
      <ScriptsSection />
    </main>
  )
}
