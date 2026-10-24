import { useState, type FormEvent, type JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Input } from '@renderer/ui/Input'
import { applyProjectCommand } from '../shorts/shortActions'
import { createScriptCommand } from './scriptCommands'
import styles from './NewScriptDialog.module.css'

export interface NewScriptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Called with the new script's id so the caller can open it.
  onCreated: (scriptId: string) => void
}

// Creates an empty script. Lines are added in the script editor.
export function NewScriptDialog({
  open,
  onOpenChange,
  onCreated
}: NewScriptDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New script"
      description="Name the script and say what it is about. You write the lines next."
    >
      {open && (
        <ScriptForm
          onDone={(scriptId) => {
            onOpenChange(false)
            if (scriptId) onCreated(scriptId)
          }}
        />
      )}
    </Dialog>
  )
}

function ScriptForm({ onDone }: { onDone: (scriptId: string | null) => void }): JSX.Element {
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (title.trim() === '') {
      setError('A script needs a title.')
      return
    }
    const id = crypto.randomUUID()
    applyProjectCommand(createScriptCommand({ id, title, topic, lines: [] }))
    onDone(id)
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <Input
          value={title}
          maxLength={120}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setTitle(event.target.value)
            setError(null)
          }}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Topic</span>
        <Input value={topic} maxLength={240} onChange={(event) => setTopic(event.target.value)} />
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.footer}>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Create script
        </Button>
      </div>
    </form>
  )
}
