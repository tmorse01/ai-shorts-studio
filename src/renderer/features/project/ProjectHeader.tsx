import { useState, type FormEvent, type JSX } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { BackButton } from '@renderer/routes/BackButton'
import { revealProject, renameProject } from '../dashboard/projectActions'
import { applyProjectCommand } from '../shorts/shortActions'
import { projectStore } from './projectStore'
import { renameProjectCommand } from './projectCommands'
import { SaveStatus } from './SaveStatus'
import { useProjectStore } from './useProjectStore'
import styles from './ProjectHeader.module.css'

// Project name with inline rename, the back button, the save status and the "⋯" menu.
export function ProjectHeader(): JSX.Element {
  const name = useProjectStore((state) => state.current?.project.name ?? '')
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? '')
  const [renaming, setRenaming] = useState(false)

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
          { label: 'Reveal in Explorer', onSelect: () => void revealProject(folderPath) }
        ]}
      />
    </header>
  )
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
