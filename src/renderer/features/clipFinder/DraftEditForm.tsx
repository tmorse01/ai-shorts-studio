// The editor for an AI draft, open under its row. Name, In and Out (in seconds) and note can change before
// the draft is accepted. Saving only changes the draft in this panel; nothing is saved until Accept.
import { useState, type FormEvent, type JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { draftEditFromInput, type DraftEdit, type DraftEditInput } from './clipFinderModel'
import styles from './DraftEditForm.module.css'

export interface DraftEditFormProps {
  initial: DraftEditInput
  onSave: (edit: DraftEdit) => void
  onCancel: () => void
}

export function DraftEditForm({ initial, onSave, onCancel }: DraftEditFormProps): JSX.Element {
  const [input, setInput] = useState<DraftEditInput>(initial)
  const [error, setError] = useState<string | undefined>(undefined)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = draftEditFromInput(input)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSave(result.edit)
  }

  return (
    <form className={styles.form} aria-label="Edit suggested clip" onSubmit={submit}>
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          value={input.name}
          onChange={(event) => setInput({ ...input, name: event.target.value })}
        />
      </label>
      <div className={styles.range}>
        <label className={styles.field}>
          <span className={styles.label}>In (s)</span>
          <input
            className={styles.input}
            inputMode="decimal"
            value={input.inSec}
            onChange={(event) => setInput({ ...input, inSec: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Out (s)</span>
          <input
            className={styles.input}
            inputMode="decimal"
            value={input.outSec}
            onChange={(event) => setInput({ ...input, outSec: event.target.value })}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Note</span>
        <input
          className={styles.input}
          value={input.note}
          onChange={(event) => setInput({ ...input, note: event.target.value })}
        />
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
}
