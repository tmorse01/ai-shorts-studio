import { useState, type JSX } from 'react'
import type { RecentProject } from '@shared/project/recentProjects'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { deleteProjectFolder } from './projectActions'

export interface DeleteProjectDialogProps {
  // The project to delete, or null when the dialog is closed.
  project: RecentProject | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

// Confirms before a project folder goes to the Recycle Bin. Footage kept outside the folder is not
// touched, because projects reference media in place.
export function DeleteProjectDialog({
  project,
  onOpenChange,
  onDeleted
}: DeleteProjectDialogProps): JSX.Element {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!project || busy) return
    setBusy(true)
    const deleted = await deleteProjectFolder(project.folderPath)
    setBusy(false)
    if (deleted) {
      onOpenChange(false)
      onDeleted()
    }
  }

  return (
    <Dialog
      open={project !== null}
      onOpenChange={onOpenChange}
      title={`Delete "${project?.name ?? ''}"?`}
      description="The project folder, with its project file, caches and exports, moves to the Recycle Bin. Footage stored outside the folder is not touched."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={busy} onClick={() => void confirm()}>
            Move to Recycle Bin
          </Button>
        </>
      }
    />
  )
}
