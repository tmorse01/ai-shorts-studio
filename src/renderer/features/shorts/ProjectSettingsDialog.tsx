import { useState, type FormEvent, type JSX } from 'react'
import type { ShortPlatform } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Input } from '@renderer/ui/Input'
import { Select } from '@renderer/ui/Select'
import { Switch } from '@renderer/ui/Switch'
import { projectStore } from '../project/projectStore'
import { useProjectStore } from '../project/useProjectStore'
import { updateProjectDefaultsCommand, validateTargetLength } from './projectDefaultsCommands'
import { PLATFORM_OPTIONS } from './platformOptions'
import formStyles from '../dashboard/CreateProjectDialog.module.css'
import styles from './ProjectSettingsDialog.module.css'

export interface ProjectSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Edits the defaults that new shorts copy. Existing shorts keep their overrides. Radix unmounts the
// content when the dialog closes, so each opening starts from the current defaults.
export function ProjectSettingsDialog({
  open,
  onOpenChange
}: ProjectSettingsDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Project settings"
      description="New shorts copy these defaults. Shorts that already exist keep their own settings."
    >
      {open && <DefaultsForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function DefaultsForm({ onDone }: { onDone: () => void }): JSX.Element | null {
  const defaults = useProjectStore((state) => state.current?.project.defaults)
  const [minSec, setMinSec] = useState(String(defaults?.targetLength.minSec ?? ''))
  const [maxSec, setMaxSec] = useState(String(defaults?.targetLength.maxSec ?? ''))
  const [platform, setPlatform] = useState<ShortPlatform>(defaults?.platform ?? 'generic')
  const [safeZones, setSafeZones] = useState(defaults?.safeZones ?? true)
  const [error, setError] = useState<string | null>(null)

  if (!defaults) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    const min = Number(minSec)
    const max = Number(maxSec)
    const problem = validateTargetLength(min, max)
    if (problem) {
      setError(problem)
      return
    }
    projectStore.getState().edit((draft) => {
      updateProjectDefaultsCommand({
        targetLength: { minSec: min, maxSec: max },
        platform,
        safeZones
      }).produce(draft)
    })
    onDone()
  }

  return (
    <form className={formStyles.form} onSubmit={submit} noValidate>
      <div className={formStyles.folderRow}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Min length (seconds)</span>
          <Input
            type="number"
            min={1}
            value={minSec}
            onChange={(e) => {
              setMinSec(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Max length (seconds)</span>
          <Input
            type="number"
            min={1}
            value={maxSec}
            onChange={(e) => {
              setMaxSec(e.target.value)
              setError(null)
            }}
          />
        </label>
      </div>
      <div className={formStyles.field}>
        <span className={formStyles.label}>Platform</span>
        <Select
          aria-label="Platform"
          options={PLATFORM_OPTIONS}
          value={platform}
          onValueChange={(value) => setPlatform(value as ShortPlatform)}
        />
      </div>
      <Switch checked={safeZones} onCheckedChange={setSafeZones}>
        Show safe-zone overlay
      </Switch>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>{' '}
        <Button variant="primary" type="submit">
          Save
        </Button>
      </div>
    </form>
  )
}
