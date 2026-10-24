import type { JSX, ReactNode } from 'react'
import { Button } from '@renderer/ui/Button'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { TimecodeField } from '@renderer/ui/TimecodeField'
import { dbToGain, formatDb, gainToDb, parseDb, SILENT_DB } from '@renderer/ui/fieldMath'
import { useInspectorStore } from '../inspector/useInspectorStore'
import styles from './ClipAudioSection.module.css'

// The inspector's clip audio section (Epic 07, #91; fades in Epic 08, #97), in the Audio tab. It edits
// an audio clip that stands on its own: mute, volume in dB, and fade in and out. Each change is one
// undoable edit, and a volume drag folds into one entry. Linked sound is set in the Video clip section.
export function ClipAudioSection(): JSX.Element {
  const target = useInspectorStore((state) => state.audioTarget)

  if (!target) {
    return (
      <p className={styles.empty}>
        Select an audio clip to see its volume and fades. Sound linked to a video clip is set in the
        Video clip section.
      </p>
    )
  }

  return (
    <div className={styles.body}>
      <Field label="Sound">
        <Button
          variant="secondary"
          aria-pressed={target.muted}
          onClick={() =>
            target.apply(target.muted ? 'Unmute clip' : 'Mute clip', { muted: !target.muted })
          }
        >
          {target.muted ? 'Unmute' : 'Mute'}
        </Button>
      </Field>
      <Field label="Volume">
        <SliderNumberField
          label="Clip volume"
          value={gainToDb(target.gain)}
          min={SILENT_DB}
          max={gainToDb(2)}
          step={0.5}
          format={formatDb}
          parse={parseDb}
          onChange={(db) =>
            target.apply(
              'Change clip volume',
              { gain: dbToGain(db) },
              `clip-volume-${target.clipId}`
            )
          }
        />
      </Field>
      <Field label="Fade in">
        <TimecodeField
          label="Fade in"
          valueMs={target.fadeInMs}
          onChange={(ms) => target.apply('Change fade in', { fadeInMs: ms })}
        />
      </Field>
      <Field label="Fade out">
        <TimecodeField
          label="Fade out"
          valueMs={target.fadeOutMs}
          onChange={(ms) => target.apply('Change fade out', { fadeOutMs: ms })}
        />
      </Field>
    </div>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the video clip section rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
