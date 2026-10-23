import { useEffect, useState } from 'react'
import type { ProjectView } from '../../shared/api'
import { Modal } from '../chrome/Modal'

export interface ProjectSettingsDialogProps {
  open: boolean
  project: ProjectView | null
  onRename: (name: string) => Promise<void>
  onClose: () => void
}

/** Settings that belong to one project. Music is no longer set here: music files live in the media library. */
export function ProjectSettingsDialog({ open, project, onRename, onClose }: ProjectSettingsDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset the form from the project each time the dialog opens.
  useEffect(() => {
    if (open && project) setName(project.name)
  }, [open, project])

  if (!project) return null

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onRename(name.trim() || project.name)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="Project settings"
      description={`Settings for ${project.name}.`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            Save name
          </button>
        </>
      }
    >
      <label>
        Project name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </Modal>
  )
}
