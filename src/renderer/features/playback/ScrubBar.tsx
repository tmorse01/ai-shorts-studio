import { useStore } from 'zustand'
import { markedRange, rangePercent } from '@shared/media/sourceMarks'
import { sourceStore } from '../source/sourceStore'
import { usePlaybackClock } from './usePlaybackClock'
import { formatTimecode } from './playbackClock'
import { usePlaybackStore } from './usePlaybackStore'
import { playbackStore } from './playbackStore'
import styles from './ScrubBar.module.css'

// The scrub bar under the preview: a slider for the playhead, the marked In and Out range in Source
// view, and the current time over the duration.
export function ScrubBar() {
  usePlaybackClock()
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const durationMs = usePlaybackStore((state) => state.durationMs)
  const mode = useStore(sourceStore, (state) => state.mode)
  const inMs = useStore(sourceStore, (state) => state.inMs)
  const outMs = useStore(sourceStore, (state) => state.outMs)

  const range = mode === 'source' ? markedRange({ inMs, outMs }) : null
  const span = range && durationMs > 0 ? rangePercent(range, durationMs) : null

  return (
    <div className={styles.bar}>
      <div className={styles.track}>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={durationMs}
          step={1}
          value={playheadMs}
          aria-label="Playhead"
          onChange={(event) => playbackStore.getState().seek(Number(event.target.value))}
        />
        <div className={styles.markRow} aria-hidden="true">
          {span ? (
            <span
              className={styles.range}
              style={{ left: `${span.left}%`, width: `${span.width}%` }}
            />
          ) : null}
        </div>
      </div>
      {mode === 'source' && (inMs !== null || outMs !== null) ? (
        <span className={styles.marks}>
          In {inMs === null ? '--:--:--' : formatTimecode(inMs)} Out{' '}
          {outMs === null ? '--:--:--' : formatTimecode(outMs)}
        </span>
      ) : null}
      <span className={styles.timecode}>
        {formatTimecode(playheadMs)} / {formatTimecode(durationMs)}
      </span>
    </div>
  )
}
