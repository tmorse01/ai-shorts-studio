import { useStore } from 'zustand'
import { ScrubBar } from '../playback/ScrubBar'
import { SourceViewer } from '../source/SourceViewer'
import { ViewModeToggle } from '../source/ViewModeToggle'
import { sourceStore } from '../source/sourceStore'
import styles from './PreviewCanvas.module.css'

// The centre of the editor: a near-black canvas, with the scrub bar along the bottom edge. In Source
// view it shows the clip being viewed; in Short view, an empty 9:16 frame until the timeline renders.
export function PreviewCanvas() {
  const mode = useStore(sourceStore, (state) => state.mode)
  return (
    <section className={styles.canvas} aria-label="Preview">
      <div className={styles.toggle}>
        <ViewModeToggle />
      </div>
      {mode === 'source' ? (
        <SourceViewer />
      ) : (
        <div className={styles.frame} role="img" aria-label="Empty 9:16 preview frame">
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.ratio} aria-hidden="true">
            9:16
          </span>
        </div>
      )}
      <div className={styles.scrub}>
        <ScrubBar />
      </div>
    </section>
  )
}
