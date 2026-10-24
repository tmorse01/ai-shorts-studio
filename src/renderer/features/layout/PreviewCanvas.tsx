import { useEffect, useRef, type JSX } from 'react'
import { hasClips } from '@shared/compositor/frame'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { Timeline } from '@shared/timeline/timeline'
import { useAudioPreview } from '../audio/useAudioPreview'
import { ScrubBar } from '../playback/ScrubBar'
import { playbackStore } from '../playback/playbackStore'
import { EMPTY_TIMELINE } from '../preview/previewFrame'
import { useMediaSourceSync } from '../preview/useMediaSourceSync'
import { useVideoPreview } from '../preview/useVideoPreview'
import { EmptyState } from './EmptyState'
import styles from './PreviewCanvas.module.css'

export interface PreviewCanvasProps {
  timeline?: Timeline
}

// The centre of the editor: a near-black canvas holding a 9:16 frame, with the scrub bar along the
// bottom edge. The frame is drawn by the compositor from the short's timeline. A short with no clips
// shows an empty state, and offline footage shows a placeholder.
export function PreviewCanvas({ timeline = EMPTY_TIMELINE }: PreviewCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useMediaSourceSync()
  const { offline, droppedFrames } = useVideoPreview(canvasRef, timeline)
  useAudioPreview(timeline)

  useEffect(() => {
    playbackStore.getState().setDurationMs(timelineDurationMs(timeline))
  }, [timeline])

  return (
    <section className={styles.canvas} aria-label="Preview">
      <div className={styles.frame} role="img" aria-label="9:16 preview frame">
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.ratio} aria-hidden="true">
          9:16
        </span>
        <canvas ref={canvasRef} className={styles.video} aria-hidden="true" />
        {!hasClips(timeline) ? (
          <div className={styles.overlay}>
            <EmptyState
              title="No clips yet"
              description="Add footage to this short and it will play here."
            />
          </div>
        ) : null}
        {offline ? (
          <div className={styles.offline} role="status">
            <span className={styles.offlineTitle}>Media offline</span>
            <span className={styles.offlineHint}>Relink this footage to preview it.</span>
          </div>
        ) : null}
        {import.meta.env.DEV ? (
          <span className={styles.dropped} aria-hidden="true">
            Dropped {droppedFrames}
          </span>
        ) : null}
      </div>
      <div className={styles.scrub}>
        <ScrubBar />
      </div>
    </section>
  )
}
