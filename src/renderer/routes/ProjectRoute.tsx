import type { JSX } from 'react'
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './rootRoute'
import { ShortsGrid } from '@renderer/features/shorts/ShortsGrid'
import { SaveStatus } from '@renderer/features/project/SaveStatus'
import { useProjectStore } from '@renderer/features/project/useProjectStore'
import styles from './ProjectRoute.module.css'

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$projectId',
  component: ProjectPage
})

// Project home. The shorts grid sits under the project name. The rest of the screen arrives with
// its own tasks.
function ProjectPage(): JSX.Element {
  const name = useProjectStore((state) => state.current?.project.name)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{name ?? 'Project'}</h1>
        <SaveStatus />
      </header>
      <ShortsGrid />
    </main>
  )
}
