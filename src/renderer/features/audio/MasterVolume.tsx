import type { JSX } from 'react'
import { Volume2 } from 'lucide-react'
import { audioSettingsStore, useAudioSettings } from './audioSettingsStore'
import styles from './MasterVolume.module.css'

// The master volume slider beside the scrub bar. It scales the whole preview mix.
export function MasterVolume(): JSX.Element {
  const volume = useAudioSettings((state) => state.masterVolume)
  return (
    <div className={styles.control}>
      <Volume2 className={styles.icon} aria-hidden="true" size={16} />
      <input
        type="range"
        className={styles.slider}
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-label="Master volume"
        onChange={(event) =>
          audioSettingsStore.getState().setMasterVolume(Number(event.target.value))
        }
      />
    </div>
  )
}
