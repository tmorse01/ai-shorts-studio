import { useState, type JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { deleteProjectFolder } from './projectActions'
import styles from './DeleteProjectDialog.module.css'

export interface DeleteProjectDialogProps {
  // The project to delete, or null when the dialog is closed.
  project: { name: string; folderPath: string } | null
  // File names of footage stored inside the project folder. They go to the Recycle Bin too, so the
  // dialog calls them out.
  footageInside?: string[]
  // Runs before the folder is trashed. Resolving false stops the delete, for example when pending
  // changes could not be saved.
  beforeDelete?: () => Promise<boolean>
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

const LISTED_NAMES = 5

// Confirms before a project folder goes to the Recycle Bin. Footage kept outside the folder is not
// touched, because projects reference media in place.
export function DeleteProjectDialog({
  project,
  footageInside = [],
  beforeDelete,
  onOpenChange,
  onDeleted
}: DeleteProjectDialogProps): JSX.Element {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!project || busy) return
    setBusy(true)
    const ready = beforeDelete ? await beforeDelete() : true
    const deleted = ready && (await deleteProjectFolder(project.folderPath))
    setBusy(false)
    if (deleted) {
      onOpenChange(false)
      onDeleted()
    }
  }

  const listed = footageInside.slice(0, LISTED_NAMES)
  const more = footageInside.length - listed.length

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
    >
      {footageInside.length > 0 && (
        <p className={styles.footage}>
          {footageInside.length === 1
            ? '1 footage file is'
            : `${footageInside.length} footage files are`}{' '}
          stored inside this folder and moves to the Recycle Bin with it: {listed.join(', ')}
          {more > 0 ? ` and ${more} more` : ''}.
        </p>
      )}
    </Dialog>
  )
}
