import { useMemo, useState, type FormEvent, type JSX } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { footageInsideFolder } from '@shared/project/footageInside'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { BackButton } from '@renderer/routes/BackButton'
import { DeleteProjectDialog } from '../dashboard/DeleteProjectDialog'
import { removeFromList, renameProject, revealProject } from '../dashboard/projectActions'
import { applyProjectCommand } from '../shorts/shortActions'
import { projectStore } from './projectStore'
import { renameProjectCommand } from './projectCommands'
import { resetEditorState } from './resetEditorState'
import { SaveStatus } from './SaveStatus'
import { useProjectStore } from './useProjectStore'
import styles from './ProjectHeader.module.css'

// Project name with inline rename, the back button, the save status and the "⋯" menu.
export function ProjectHeader(): JSX.Element {
  const router = useRouter()
  const name = useProjectStore((state) => state.current?.project.name ?? '')
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? '')
  const media = useProjectStore((state) => state.current?.project.media)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const footageInside = useMemo(
    () => footageInsideFolder(media ?? [], folderPath).map((ref) => fileName(ref.path)),
    [media, folderPath]
  )

  // Takes the project off the recent list. The files stay where they are. Stays on the page if the
  // project's last changes could not be saved, so nothing is lost.
  async function removeFromRecent() {
    if (!(await removeFromList(folderPath))) return
    if (await projectStore.getState().close()) {
      resetEditorState()
      void router.navigate({ to: '/' })
    }
  }

  // Writes pending changes before the folder is trashed, so nothing is written back into it. A
  // failed write stops the delete.
  async function saveBeforeDelete(): Promise<boolean> {
    await projectStore.getState().flush()
    return projectStore.getState().saveStatus.kind !== 'error'
  }

  // The folder is gone, so the project is closed without a write and the editor is cleared.
  async function leaveDeletedProject() {
    await projectStore.getState().close()
    resetEditorState()
    void router.navigate({ to: '/' })
  }

  return (
    <header className={styles.header}>
      <BackButton />
      {renaming ? (
        <RenameForm
          initial={name}
          onDone={(next) => {
            setRenaming(false)
            if (next) void commitRename(folderPath, next)
          }}
        />
      ) : (
        <button type="button" className={styles.title} onClick={() => setRenaming(true)}>
          {name}
        </button>
      )}
      <SaveStatus />
      <DropdownMenu
        trigger={<IconButton icon={MoreHorizontal} label="Project actions" />}
        items={[
          { label: 'Rename', onSelect: () => setRenaming(true) },
          { label: 'Reveal in Explorer', onSelect: () => void revealProject(folderPath) },
          { label: 'Remove from list', onSelect: () => void removeFromRecent() },
          { label: 'Delete folder…', onSelect: () => setDeleting(true), destructive: true }
        ]}
      />
      <DeleteProjectDialog
        project={deleting ? { name, folderPath } : null}
        footageInside={footageInside}
        beforeDelete={saveBeforeDelete}
        onOpenChange={(open) => {
          if (!open) setDeleting(false)
        }}
        onDeleted={() => void leaveDeletedProject()}
      />
    </header>
  )
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// Applies the rename as an undoable command, saves it, then updates the gallery's copy of the name.
async function commitRename(folderPath: string, name: string): Promise<void> {
  applyProjectCommand(renameProjectCommand(name))
  await projectStore.getState().flush()
  await renameProject(folderPath, name)
}

function RenameForm({
  initial,
  onDone
}: {
  initial: string
  onDone: (next: string | null) => void
}) {
  const [value, setValue] = useState(initial)

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    onDone(trimmed === '' || trimmed === initial ? null : trimmed)
  }

  return (
    <form onSubmit={submit} className={styles.rename}>
      <Input
        aria-label="Project name"
        value={value}
        maxLength={120}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(null)
        }}
      />
      <Button variant="ghost" size="sm" type="submit">
        Save
      </Button>
    </form>
  )
}
