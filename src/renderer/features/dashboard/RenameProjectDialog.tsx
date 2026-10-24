import { useState, type FormEvent, type JSX } from 'react'
import type { RecentProject } from '@shared/project/recentProjects'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Input } from '@renderer/ui/Input'
import { renameProject } from './projectActions'
import styles from './CreateProjectDialog.module.css'

export interface RenameProjectDialogProps {
  // The project being renamed, or null when the dialog is closed.
  project: RecentProject | null
  onOpenChange: (open: boolean) => void
  onRenamed: () => void
}

// Renames a project in its project file and in the gallery. The folder itself is not renamed.
export function RenameProjectDialog({
  project,
  onOpenChange,
  onRenamed
}: RenameProjectDialogProps): JSX.Element {
  return (
    <Dialog
      open={project !== null}
      onOpenChange={onOpenChange}
      title="Rename project"
      description="Only the project's name changes. The folder keeps its name."
    >
      {project && (
        <RenameForm
          key={project.folderPath}
          project={project}
          onCancel={() => onOpenChange(false)}
          onRenamed={() => {
            onOpenChange(false)
            onRenamed()
          }}
        />
      )}
    </Dialog>
  )
}

interface RenameFormProps {
  project: RecentProject
  onCancel: () => void
  onRenamed: () => void
}

function RenameForm({ project, onCancel, onRenamed }: RenameFormProps): JSX.Element {
  const [name, setName] = useState(project.name)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next = name.trim()
    if (!next || busy) return
    setBusy(true)
    const renamed = await renameProject(project.folderPath, next)
    setBusy(false)
    if (renamed) onRenamed()
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <Input value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>{' '}
        <Button variant="primary" type="submit" loading={busy} disabled={!name.trim()}>
          Rename
        </Button>
      </div>
    </form>
  )
}
