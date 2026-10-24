import { useState, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { Project, Short, ShortPlatform, ShortStatus } from '@shared/project/schema'
import {
  effectiveShortSettings,
  overriddenFields,
  targetReadout,
  type ShortOverrideField
} from '@shared/shorts/shortSettings'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import { Button } from '@renderer/ui/Button'
import { Input } from '@renderer/ui/Input'
import { Select } from '@renderer/ui/Select'
import { Switch } from '@renderer/ui/Switch'
import { editorHistory } from '../history/editorHistory'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand } from './shortActions'
import { PLATFORM_OPTIONS } from './platformOptions'
import { renameShortCommand, setShortStatusCommand, type ManualShortStatus } from './shortCommands'
import { resetShortOverrideCommand, updateShortOverridesCommand } from './shortOverrideCommands'
import { validateTargetLength } from './projectDefaultsCommands'
import styles from './ShortPropertiesSection.module.css'

const STATUS_OPTIONS: { value: ShortStatus; label: string; disabled?: boolean }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'exported', label: 'Exported', disabled: true }
]

const NO_SHORTS: Project['shorts'] = []

// The inspector's short properties (Epic 05). Shown when nothing is selected in the editor. Each
// field edits the open short. A field the short overrides is marked, with a reset to the project
// default. Every change is one edit in the project history.
export function ShortPropertiesSection(): JSX.Element {
  const activeId = useStore(editorHistory.selection, (state) => state.activeId)
  const short = useProjectStore((state) =>
    (state.current?.project.shorts ?? NO_SHORTS).find((item) => item.id === activeId)
  )
  const defaults = useProjectStore((state) => state.current?.project.defaults)

  if (!short || !defaults) {
    return <p className={styles.empty}>Open a short to see its properties.</p>
  }

  return <ShortForm key={short.id} short={short} defaults={defaults} />
}

interface ShortFormProps {
  short: Short
  defaults: Project['defaults']
}

function ShortForm({ short, defaults }: ShortFormProps): JSX.Element {
  const effective = effectiveShortSettings(defaults, short.overrides)
  const overridden = overriddenFields(short.overrides)
  const isOverridden = (field: ShortOverrideField) => overridden.includes(field)
  const now = () => new Date().toISOString()
  const readout = targetReadout(timelineDurationMs(short.timeline), effective.targetLength)

  function setOverride(change: Parameters<typeof updateShortOverridesCommand>[1], label: string) {
    applyProjectCommand(updateShortOverridesCommand(short.id, change, now(), label))
  }

  function reset(field: ShortOverrideField) {
    applyProjectCommand(resetShortOverrideCommand(short.id, field, now()))
  }

  return (
    <div className={styles.body}>
      <Field label="Name">
        <NameInput
          key={short.name}
          name={short.name}
          onCommit={(name) => applyProjectCommand(renameShortCommand(short.id, name, now()))}
        />
      </Field>

      <Field label="Status">
        <Select
          aria-label="Status"
          options={STATUS_OPTIONS}
          value={short.status}
          disabled={short.status === 'exported'}
          onValueChange={(value) =>
            applyProjectCommand(setShortStatusCommand(short.id, value as ManualShortStatus, now()))
          }
        />
      </Field>

      <Field
        label="Target length"
        overridden={isOverridden('targetLength')}
        onReset={() => reset('targetLength')}
      >
        <TargetLengthInput
          key={`${effective.targetLength.minSec}-${effective.targetLength.maxSec}`}
          minSec={effective.targetLength.minSec}
          maxSec={effective.targetLength.maxSec}
          onCommit={(targetLength) => setOverride({ targetLength }, 'Change target length')}
        />
      </Field>

      <Field
        label="Platform"
        overridden={isOverridden('platform')}
        onReset={() => reset('platform')}
      >
        <Select
          aria-label="Platform"
          options={PLATFORM_OPTIONS}
          value={effective.platform}
          onValueChange={(value) =>
            setOverride({ platform: value as ShortPlatform }, 'Change platform')
          }
        />
      </Field>

      <Field
        label="Safe zones"
        overridden={isOverridden('safeZones')}
        onReset={() => reset('safeZones')}
      >
        <Switch
          checked={effective.safeZones}
          onCheckedChange={(safeZones) => setOverride({ safeZones }, 'Change safe zones')}
        >
          Show safe-zone overlay
        </Switch>
      </Field>

      <p className={styles.readout} data-tone={readout.tone} aria-live="polite">
        {readout.text}
      </p>
    </div>
  )
}

interface FieldProps {
  label: string
  overridden?: boolean
  onReset?: () => void
  children: ReactNode
}

// One labelled row. An overridden field shows a marker and a reset button.
function Field({ label, overridden = false, onReset, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <div className={styles.labelLine}>
        <span className={styles.label}>{label}</span>
        {overridden && (
          <span className={styles.overridden}>
            <span className={styles.marker} aria-hidden="true" />
            Overridden
            <Button size="sm" variant="ghost" onClick={onReset}>
              Reset to project default
            </Button>
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// Commits on Enter or blur. An empty name is not saved; the field goes back to the current name.
function NameInput({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(name)

  function commit() {
    const trimmed = value.trim()
    if (trimmed === '') {
      setValue(name)
      return
    }
    if (trimmed !== name) onCommit(trimmed)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') setValue(name)
  }

  return (
    <Input
      aria-label="Name"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}

// Minimum and maximum seconds. Commits on blur when both are valid and one of them changed.
function TargetLengthInput({
  minSec,
  maxSec,
  onCommit
}: {
  minSec: number
  maxSec: number
  onCommit: (target: { minSec: number; maxSec: number }) => void
}) {
  const [minText, setMinText] = useState(String(minSec))
  const [maxText, setMaxText] = useState(String(maxSec))
  const [error, setError] = useState<string | null>(null)

  function commit() {
    const min = Number(minText)
    const max = Number(maxText)
    const problem = validateTargetLength(min, max)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    if (min !== minSec || max !== maxSec) onCommit({ minSec: min, maxSec: max })
  }

  return (
    <div className={styles.targetGroup}>
      <div className={styles.targetRow}>
        <Input
          type="number"
          min={1}
          aria-label="Minimum seconds"
          value={minText}
          onChange={(event) => {
            setMinText(event.target.value)
            setError(null)
          }}
          onBlur={commit}
        />
        <span className={styles.dash} aria-hidden="true">
          -
        </span>
        <Input
          type="number"
          min={1}
          aria-label="Maximum seconds"
          value={maxText}
          onChange={(event) => {
            setMaxText(event.target.value)
            setError(null)
          }}
          onBlur={commit}
        />
        <span className={styles.unit}>s</span>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
