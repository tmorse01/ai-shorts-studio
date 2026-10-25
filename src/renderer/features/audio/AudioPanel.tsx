// The Audio left panel (Epics 07, 10 and 12). It groups the three audio tools for the open short: record
// a narration take, the music lane's settings (loop and ducking) and the sound of the selected audio clip.
// The clip sections follow the timeline selection, the same as the inspector's Audio tab.
import type { JSX, ReactNode } from 'react'
import { ClipAudioSection } from './ClipAudioSection'
import { MusicSection } from '../music/MusicSection'
import { RecordNarrationButton } from '../narration/RecordNarrationButton'
import styles from './AudioPanel.module.css'

export interface AudioPanelProps {
  shortId?: string
}

export function AudioPanel({ shortId }: AudioPanelProps): JSX.Element {
  return (
    <div className={styles.panel}>
      <Group title="Narration">
        {shortId ? (
          <div className={styles.row}>
            <span className={styles.hint}>Record a take onto the Narration lane.</span>
            <RecordNarrationButton shortId={shortId} />
          </div>
        ) : (
          <p className={styles.hint}>Open a short to record narration.</p>
        )}
      </Group>
      <Group title="Music">
        <MusicSection />
      </Group>
      <Group title="Clip audio">
        <ClipAudioSection />
      </Group>
    </div>
  )
}

interface GroupProps {
  title: string
  children: ReactNode
}

function Group({ title, children }: GroupProps): JSX.Element {
  return (
    <section className={styles.group}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </section>
  )
}
