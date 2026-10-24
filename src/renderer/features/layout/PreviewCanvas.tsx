import { useEffect, useRef, type JSX } from 'react'
import { hasClips } from '@shared/compositor/frame'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { Timeline } from '@shared/timeline/timeline'
import { useAudioPreview } from '../audio/useAudioPreview'
import { CanvasGizmo } from '../compositor/CanvasGizmo'
import { useCanvasGizmo } from '../compositor/useCanvasGizmo'
import { ScrubBar } from '../playback/ScrubBar'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { EMPTY_TIMELINE } from '../preview/previewFrame'
import { useMediaSourceSync } from '../preview/useMediaSourceSync'
import { useVideoPreview } from '../preview/useVideoPreview'
import { EmptyState } from './EmptyState'
import styles from './PreviewCanvas.module.css'

export interface PreviewCanvasProps {
  timeline?: Timeline
  // The open short. The canvas gizmo edits its layers; with no short open, the frame is view only.
  shortId?: string
}

// The centre of the editor: a near-black canvas holding a 9:16 frame, with the scrub bar along the
// bottom edge. The frame is drawn by the compositor from the short's timeline. A short with no clips
// shows an empty state, and offline footage shows a placeholder. A layer is selected and moved on the
// frame when the short is paused.
export function PreviewCanvas({
  timeline = EMPTY_TIMELINE,
  shortId
}: PreviewCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  useMediaSourceSync()
  const { offline, droppedFrames } = useVideoPreview(canvasRef, timeline)
  useAudioPreview(timeline)
  const playing = usePlaybackStore((state) => state.playing)
  const { guides, handlers } = useCanvasGizmo({ shortId, timeline, frameRef })

  useEffect(() => {
    playbackStore.getState().setDurationMs(timelineDurationMs(timeline))
  }, [timeline])

  return (
    <section className={styles.canvas} aria-label="Preview">
      <div
        ref={frameRef}
        className={styles.frame}
        role="img"
        aria-label="9:16 preview frame"
        tabIndex={0}
        {...handlers}
      >
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.ratio} aria-hidden="true">
          9:16
        </span>
        <canvas ref={canvasRef} className={styles.video} aria-hidden="true" />
        {!playing ? <CanvasGizmo guides={guides} /> : null}
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
