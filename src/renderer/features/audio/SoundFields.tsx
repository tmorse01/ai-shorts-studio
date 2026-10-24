import type { JSX, ReactNode } from 'react'
import { Button } from '@renderer/ui/Button'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { TimecodeField } from '@renderer/ui/TimecodeField'
import {
  dbToGain,
  formatDb,
  gainToDb,
  MIXED_VALUE,
  parseDb,
  SILENT_DB
} from '@renderer/ui/fieldMath'
import type { AudioTarget } from '../inspector/inspectorStore'
import styles from './SoundFields.module.css'

export interface SoundFieldsProps {
  target: AudioTarget
}

// The sound fields: mute, volume in dB, and fade in and out (Epic 07, #91). They edit every sound in the
// selection together (#99). A property whose values differ shows "—" until it is set, and each edit is one
// undoable entry. A volume drag folds into one entry.
export function SoundFields({ target }: SoundFieldsProps): JSX.Element {
  const { shared, soundIds, apply } = target
  const muted = shared.muted
  const gain = shared.gain
  const mergeKey = `sound-volume-${soundIds.join(',')}`

  return (
    <div className={styles.body}>
      <Field label="Sound">
        <Button
          variant="secondary"
          aria-pressed={muted.mixed ? 'mixed' : muted.value}
          onClick={() => {
            // Mixed sounds all become muted on the first press.
            const next = muted.mixed ? true : !muted.value
            apply(next ? 'Mute clip' : 'Unmute clip', { muted: next })
          }}
        >
          {muted.mixed ? MIXED_VALUE : muted.value ? 'Unmute' : 'Mute'}
        </Button>
      </Field>
      <Field label="Volume">
        <SliderNumberField
          label="Clip volume"
          value={gainToDb(gain.value)}
          mixed={gain.mixed}
          min={SILENT_DB}
          max={gainToDb(2)}
          step={0.5}
          format={formatDb}
          parse={parseDb}
          onChange={(db) => apply('Change clip volume', { gain: dbToGain(db) }, mergeKey)}
        />
      </Field>
      <Field label="Fade in">
        <TimecodeField
          label="Fade in"
          valueMs={shared.fadeInMs.value}
          mixed={shared.fadeInMs.mixed}
          onChange={(ms) => apply('Change fade in', { fadeInMs: ms })}
        />
      </Field>
      <Field label="Fade out">
        <TimecodeField
          label="Fade out"
          valueMs={shared.fadeOutMs.value}
          mixed={shared.fadeOutMs.mixed}
          onChange={(ms) => apply('Change fade out', { fadeOutMs: ms })}
        />
      </Field>
    </div>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the other inspector rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
