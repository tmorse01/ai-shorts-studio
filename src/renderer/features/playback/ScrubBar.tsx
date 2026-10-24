import { useStore } from 'zustand'
import { markedRange, rangePercent } from '@shared/media/sourceMarks'
import { mediaUsageIndex } from '@shared/timeline/mediaUsage'
import { MasterVolume } from '../audio/MasterVolume'
import { SaveMomentControl } from '../moments/SaveMomentControl'
import { projectStore } from '../project/projectStore'
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

  const sourceId = useStore(sourceStore, (state) => state.sourceId)
  const shorts = useStore(projectStore, (state) => state.current?.project.shorts)

  const range = mode === 'source' ? markedRange({ inMs, outMs }) : null
  const span = range && durationMs > 0 ? rangePercent(range, durationMs) : null

  // Stretches of this footage that a short already uses, with the shorts' names on hover.
  const shortNames = new Map((shorts ?? []).map((short) => [short.id, short.name]))
  const usedRanges =
    mode === 'source' && sourceId !== null && shorts
      ? (mediaUsageIndex(shorts).get(sourceId)?.ranges ?? [])
      : []

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
        <div className={styles.usedRow}>
          {usedRanges.map((used, index) => {
            const place = durationMs > 0 ? rangePercent(used, durationMs) : { left: 0, width: 0 }
            const names = used.shortIds.map((id) => shortNames.get(id) ?? id).join(', ')
            return (
              <span
                key={`${used.startMs}-${used.endMs}-${index}`}
                className={styles.used}
                style={{ left: `${place.left}%`, width: `${place.width}%` }}
                title={`Used in ${names}`}
              />
            )
          })}
        </div>
      </div>
      {mode === 'source' && (inMs !== null || outMs !== null) ? (
        <span className={styles.marks}>
          In {inMs === null ? '--:--:--' : formatTimecode(inMs)} Out{' '}
          {outMs === null ? '--:--:--' : formatTimecode(outMs)}
        </span>
      ) : null}
      <SaveMomentControl />
      <MasterVolume />
      <span className={styles.timecode}>
        {formatTimecode(playheadMs)} / {formatTimecode(durationMs)}
      </span>
    </div>
  )
}
