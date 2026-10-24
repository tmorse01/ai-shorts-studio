import type { JSX } from 'react'
import { useInspectorStore } from '../inspector/useInspectorStore'
import { SoundFields } from './SoundFields'
import styles from './ClipAudioSection.module.css'

// The inspector's clip audio section (Epic 07, #91; fades in Epic 08, #97), in the Audio tab. It edits the
// sound of the selected audio clips: mute, volume in dB, and fade in and out. With several clips selected,
// it shows the values they share (#99). Linked sound is set in the Video clip section.
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

  return <SoundFields target={target} />
}
