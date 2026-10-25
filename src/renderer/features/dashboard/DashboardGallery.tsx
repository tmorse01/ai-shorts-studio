import { useState, type JSX } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { RecentProject } from '@shared/project/recentProjects'
import { Button } from '@renderer/ui/Button'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { CreateProjectDialog } from './CreateProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { ProjectCard } from './ProjectCard'
import { RenameProjectDialog } from './RenameProjectDialog'
import {
  locateProject,
  openProjectFolder,
  pickFolder,
  removeFromList,
  revealProject
} from './projectActions'
import { useRecentProjects } from './useRecentProjects'
import styles from './DashboardGallery.module.css'

// The number of cards in the recent row before "View all" opens the full gallery.
const RECENT_LIMIT = 4

// The dashboard: a hero band with the main ways in (create, open a folder), then a row of recent
// projects. "View all" shows every project in the same grid.
export function DashboardGallery(): JSX.Element {
  const router = useRouter()
  const { projects, refresh } = useRecentProjects()
  const [creating, setCreating] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [renaming, setRenaming] = useState<RecentProject | null>(null)
  const [deleting, setDeleting] = useState<RecentProject | null>(null)

  function goToProject(projectId: string) {
    void router.navigate({ to: '/project/$projectId', params: { projectId } })
  }

  async function openFolder() {
    const folderPath = await pickFolder()
    if (!folderPath) return
    const projectId = await openProjectFolder(folderPath)
    if (projectId) goToProject(projectId)
  }

  async function open(project: RecentProject) {
    const projectId = await openProjectFolder(project.folderPath)
    if (projectId) goToProject(projectId)
  }

  async function locate(project: RecentProject) {
    const folderPath = await pickFolder()
    if (!folderPath) return
    if (await locateProject(project, folderPath)) await refresh()
  }

  async function remove(project: RecentProject) {
    if (await removeFromList(project.folderPath)) await refresh()
  }

  function renderCard(project: RecentProject) {
    return (
      <li key={project.folderPath}>
        <ProjectCard
          project={project}
          onOpen={() => void open(project)}
          onRename={() => setRenaming(project)}
          onReveal={() => void revealProject(project.folderPath)}
          onRemove={() => void remove(project)}
          onDelete={() => setDeleting(project)}
          onLocate={() => void locate(project)}
        />
      </li>
    )
  }

  const visible = projects !== null && !showAll ? projects.slice(0, RECENT_LIMIT) : (projects ?? [])

  return (
    <main className={styles.page} data-testid="dashboard-page">
      <section className={styles.hero} aria-labelledby="dashboard-heading">
        <p className={styles.tagline}>Footage in · Shorts out · Kept on your machine</p>
        <h1 id="dashboard-heading" className={styles.heading}>
          Projects
        </h1>
        <div className={styles.actions}>
          <Button
            variant="primary"
            data-testid="dashboard-new-project"
            onClick={() => setCreating(true)}
          >
            Create project
          </Button>
          <Button variant="secondary" onClick={() => void openFolder()}>
            Open folder…
          </Button>
        </div>
      </section>

      {projects !== null && projects.length === 0 && (
        <div className={styles.empty}>
          <EmptyState
            title="Start your first short"
            description="A project keeps your footage references, shorts and exports together in one folder."
          />
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <section className={styles.recent} aria-labelledby="recent-heading">
          <div className={styles.sectionHead}>
            <h2 id="recent-heading" className={styles.sectionLabel}>
              Recent projects
            </h2>
            {projects.length > RECENT_LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showAll}
                onClick={() => setShowAll((open) => !open)}
              >
                {showAll ? 'Show fewer' : 'View all'}
              </Button>
            )}
          </div>
          <ul className={styles.grid}>{visible.map(renderCard)}</ul>
        </section>
      )}

      <CreateProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => goToProject(projectId)}
      />
      <RenameProjectDialog
        project={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onRenamed={() => void refresh()}
      />
      <DeleteProjectDialog
        project={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onDeleted={() => void refresh()}
      />
    </main>
  )
}
