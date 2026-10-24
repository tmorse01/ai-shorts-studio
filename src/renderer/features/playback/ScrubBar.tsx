import { MasterVolume } from '../audio/MasterVolume'
import { usePlaybackClock } from './usePlaybackClock'
import { formatTimecode } from './playbackClock'
import { usePlaybackStore } from './usePlaybackStore'
import { playbackStore } from './playbackStore'
import styles from './ScrubBar.module.css'

// The scrub bar under the preview: a slider for the playhead and the current time over the duration.
export function ScrubBar() {
  usePlaybackClock()
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const durationMs = usePlaybackStore((state) => state.durationMs)

  return (
    <div className={styles.bar}>
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
      <MasterVolume />
      <span className={styles.timecode}>
        {formatTimecode(playheadMs)} / {formatTimecode(durationMs)}
      </span>
    </div>
  )
}
