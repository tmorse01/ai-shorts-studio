import type { JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { useInspectorStore } from '../inspector/useInspectorStore'
import styles from './ClipAudioSection.module.css'

// The inspector's clip audio section (Epic 07, #91): mute and volume for the sound of the selected
// clip. Each change is one undoable edit. A volume drag folds into one entry.
export function ClipAudioSection(): JSX.Element {
  const target = useInspectorStore((state) => state.audioTarget)

  if (!target) {
    return <p className={styles.empty}>This clip has no sound to adjust.</p>
  }

  const percent = Math.round(target.gain * 100)
  return (
    <div className={styles.body}>
      <Button
        variant="secondary"
        aria-pressed={target.muted}
        onClick={() =>
          target.apply(target.muted ? 'Unmute clip' : 'Mute clip', { muted: !target.muted })
        }
      >
        {target.muted ? 'Unmute' : 'Mute'}
      </Button>
      <label className={styles.volume}>
        <span className={styles.label}>Volume {percent}%</span>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={2}
          step={0.01}
          value={target.gain}
          aria-label="Clip volume"
          onChange={(event) =>
            target.apply(
              'Change clip volume',
              { gain: Number(event.target.value) },
              `clip-volume-${target.clipId}`
            )
          }
        />
      </label>
    </div>
  )
}
