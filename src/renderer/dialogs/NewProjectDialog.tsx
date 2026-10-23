import { useEffect, useState } from 'react'
import { Modal } from '../chrome/Modal'

export interface NewProjectDialogProps {
  open: boolean
  /** Used when the name is left blank, e.g. "Project 3". */
  defaultName: string
  /** Resolves when the project exists. The caller closes the dialog. */
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}

export function NewProjectDialog({ open, defaultName, onCreate, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Start every open with an empty field, so a previous name never carries over.
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const submit = async (): Promise<void> => {
    setSaving(true)
    try {
      await onCreate(name.trim() || defaultName)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="New project"
      description="A project holds the videos you import and the clips you cut from them."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </>
      }
    >
      <label>
        Project name
        <input
          autoFocus
          type="text"
          value={name}
          placeholder={defaultName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </label>
    </Modal>
  )
}
