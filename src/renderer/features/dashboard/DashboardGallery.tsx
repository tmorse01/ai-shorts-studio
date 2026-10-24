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

// The dashboard: a spacious gallery of recent projects, with the main ways in (create, open a folder).
export function DashboardGallery(): JSX.Element {
  const router = useRouter()
  const { projects, refresh } = useRecentProjects()
  const [creating, setCreating] = useState(false)
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Projects</h1>
          <p className={styles.lede}>Pick up a project where you left it, or start a new one.</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void openFolder()}>
            Open folder…
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create Project
          </Button>
        </div>
      </header>

      {projects !== null && projects.length === 0 && (
        <div className={styles.empty}>
          <EmptyState
            title="Start your first short"
            description="A project keeps your footage references, shorts and exports together in one folder."
          />
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create Project
          </Button>
        </div>
      )}

      {projects !== null && projects.length > 0 && (
        <ul className={styles.grid}>{projects.map(renderCard)}</ul>
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
