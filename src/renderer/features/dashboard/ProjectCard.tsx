import type { JSX } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { RecentProject } from '@shared/project/recentProjects'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { formatDuration } from './formatDuration'
import { formatRelativeTime } from './relativeTime'
import styles from './ProjectCard.module.css'

export interface ProjectCardProps {
  project: RecentProject
  onOpen: () => void
  onRename: () => void
  onReveal: () => void
  onRemove: () => void
  onDelete: () => void
  onLocate: () => void
}

// One project in the gallery. A missing project keeps its card, with Locate and Remove, so the
// user can point it at the folder again instead of losing track of it.
export function ProjectCard({
  project,
  onOpen,
  onRename,
  onReveal,
  onRemove,
  onDelete,
  onLocate
}: ProjectCardProps): JSX.Element {
  const duration = project.durationMs === undefined ? undefined : formatDuration(project.durationMs)
  const opened = `opened ${formatRelativeTime(project.lastOpened, new Date())}`
  const meta = [duration, project.ratio, opened].filter(Boolean).join(' · ')

  return (
    <article className={styles.card}>
      <button type="button" className={styles.open} disabled={project.missing} onClick={onOpen}>
        <span className={styles.thumb} aria-hidden="true">
          <span className={styles.ornament} />
          {duration && <span className={styles.badge}>{duration}</span>}
        </span>
        <span className={styles.title}>{project.name}</span>
        <span className={styles.meta}>{project.missing ? 'Folder not found' : meta}</span>
      </button>

      {project.missing ? (
        <div className={styles.missingRow}>
          <Button variant="secondary" size="sm" onClick={onLocate}>
            Locate…
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <div className={styles.menu}>
          <DropdownMenu
            trigger={<IconButton icon={MoreHorizontal} label={`Actions for ${project.name}`} />}
            items={[
              { label: 'Rename', onSelect: onRename },
              { label: 'Reveal in Explorer', onSelect: onReveal },
              { label: 'Remove from list', onSelect: onRemove },
              { label: 'Delete folder…', onSelect: onDelete, destructive: true }
            ]}
          />
        </div>
      )}
    </article>
  )
}
