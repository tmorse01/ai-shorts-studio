import { useRef, type JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { OfflineBanner } from '@renderer/features/project/OfflineBanner'
import { ProjectHeader } from '@renderer/features/project/ProjectHeader'
import { FootageSection } from '@renderer/features/projectHome/FootageSection'
import { GuidedStart } from '@renderer/features/projectHome/GuidedStart'
import { ProjectSidebar } from '@renderer/features/projectHome/ProjectSidebar'
import { useMediaDrop } from '@renderer/features/media/useMediaDrop'
import { ShortsGrid } from '@renderer/features/shorts/ShortsGrid'
import { ScriptsSection } from '@renderer/features/scripts/ScriptsSection'
import styles from './ProjectRoute.module.css'

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: ProjectPage
})

// Project home: a slim sidebar beside the page. The page holds the header, the offline footage
// warning, the guided start (until footage and a short exist), then the Footage, Shorts and Scripts
// sections. Files dropped anywhere on the page import as footage.
function ProjectPage(): JSX.Element {
  const pageRef = useRef<HTMLElement>(null)
  useMediaDrop()

  return (
    <div className={styles.shell}>
      <ProjectSidebar scrollRef={pageRef} />
      <main ref={pageRef} className={styles.page}>
        <ProjectHeader />
        <OfflineBanner />
        <GuidedStart />
        <section id="project-footage" aria-label="Footage" className={styles.section}>
          <FootageSection />
        </section>
        <div id="project-shorts" className={styles.section}>
          <ShortsGrid />
        </div>
        <div id="project-scripts" className={styles.section}>
          <ScriptsSection />
        </div>
      </main>
    </div>
  )
}
