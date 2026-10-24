import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Input } from '@renderer/ui/Input'
import { createProjectIn, defaultFolderFor, pickFolder } from './projectActions'
import styles from './CreateProjectDialog.module.css'

export interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Called with the new project's id, after the project is created and made current.
  onCreated: (projectId: string) => void
}

// Name and folder for a new project. The folder follows the name (Documents/AI Shorts Studio/<name>)
// until the user picks or types one, then it stays as they set it.
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated
}: CreateProjectDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  // The name the latest folder suggestion was asked for. Stale suggestions are dropped.
  const latestName = useRef('')

  useEffect(() => {
    if (open) return
    setName('')
    setFolderPath('')
    setFolderTouched(false)
  }, [open])

  async function changeName(value: string) {
    setName(value)
    const trimmed = value.trim()
    latestName.current = trimmed
    if (folderTouched || trimmed === '') return
    const suggested = await defaultFolderFor(trimmed)
    if (suggested && latestName.current === trimmed) setFolderPath(suggested)
  }

  async function browse() {
    const picked = await pickFolder()
    if (picked) {
      setFolderPath(picked)
      setFolderTouched(true)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !folderPath.trim() || busy) return
    setBusy(true)
    const projectId = await createProjectIn(folderPath.trim(), name.trim())
    setBusy(false)
    if (projectId) {
      onOpenChange(false)
      onCreated(projectId)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create project"
      description="Choose a name and where the project folder goes. The folder holds the project file, caches and exports."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-project-form"
            loading={busy}
            disabled={!name.trim() || !folderPath.trim()}
          >
            Create project
          </Button>
        </>
      }
    >
      <form id="create-project-form" className={styles.form} onSubmit={(e) => void submit(e)}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <Input
            value={name}
            maxLength={120}
            autoFocus
            placeholder="Harbour shoot"
            onChange={(event) => void changeName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Folder</span>
          <div className={styles.folderRow}>
            <Input
              value={folderPath}
              onChange={(event) => {
                setFolderPath(event.target.value)
                setFolderTouched(true)
              }}
            />
            <Button variant="secondary" onClick={() => void browse()}>
              Browse…
            </Button>
          </div>
        </label>
      </form>
    </Dialog>
  )
}
