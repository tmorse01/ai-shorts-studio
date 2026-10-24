// Dialog for the project's custom media tags: create, rename and delete. Quick tags are listed but
// cannot be changed. Each change is one undoable project command.
import { useState, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import { Trash2 } from 'lucide-react'
import type { Project } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { applyProjectCommand } from '../shorts/shortActions'
import { BUILT_IN_TAGS, createTagCommand, deleteTagCommand, renameTagCommand } from './mediaTags'
import styles from './MediaTagsDialog.module.css'

export interface MediaTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
}

export function MediaTagsDialog({
  open,
  onOpenChange,
  project
}: MediaTagsDialogProps): JSX.Element {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Runs one command. A rejected name or missing tag shows here instead of crashing the dialog.
  const run = (command: Parameters<typeof applyProjectCommand>[0]): boolean => {
    try {
      applyProjectCommand(command)
      setError(null)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That change could not be made.')
      return false
    }
  }

  const onCreate = (event: FormEvent) => {
    event.preventDefault()
    if (run(createTagCommand(crypto.randomUUID(), newName))) setNewName('')
  }

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      event.currentTarget.value = project.mediaTags.find((tag) => tag.id === id)?.name ?? ''
      event.currentTarget.blur()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setError(null)
        onOpenChange(next)
      }}
      title="Media tags"
      description="Quick tags are always there. Custom tags can be renamed or deleted. Deleting a tag removes it from every file."
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <ul className={styles.list}>
        {BUILT_IN_TAGS.map((tag) => (
          <li key={tag.id} className={styles.item}>
            <span className={styles.quick}>{tag.name}</span>
            <span className={styles.note}>Quick tag</span>
          </li>
        ))}
        {project.mediaTags.map((tag) => (
          <li key={`${tag.id}:${tag.name}`} className={styles.item}>
            <Input
              aria-label={`Name of tag ${tag.name}`}
              defaultValue={tag.name}
              onKeyDown={(event) => onRenameKey(event, tag.id)}
              onBlur={(event) => {
                const next = event.currentTarget.value.trim()
                if (next !== tag.name) {
                  if (!run(renameTagCommand(tag.id, next))) event.currentTarget.value = tag.name
                }
              }}
            />
            <IconButton
              icon={Trash2}
              label={`Delete tag ${tag.name}`}
              onClick={() => run(deleteTagCommand(tag.id))}
            />
          </li>
        ))}
      </ul>

      <form className={styles.create} onSubmit={onCreate}>
        <Input
          aria-label="New tag name"
          placeholder="New tag name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <Button type="submit" variant="ghost" disabled={newName.trim() === ''}>
          Add tag
        </Button>
      </form>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
