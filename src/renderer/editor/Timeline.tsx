import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizeSegments, remapCaptions, type Caption, type Segment } from '../../shared/timeline'
import {
  DEFAULT_PIXELS_PER_SECOND,
  clampPixelsPerSecond,
  moveSegment,
  outputStarts,
  outputToSource,
  pixelsToSeconds,
  rulerStep,
  secondsToPixels,
  sourceToOutput,
  totalOutputSec,
  trimEnd,
  trimStart
} from '../../shared/timeline-math'
import { fmt } from '../util'
import styles from './Timeline.module.css'

const LABEL_WIDTH = 84
const MIN_TRACK_WIDTH = 600
const DRAG_CLICK_THRESHOLD_PX = 3

export interface TimelineProps {
  segments: Segment[]
  onChange: (next: Segment[]) => void
  captions: Caption[]
  sourceDurationSec: number
  hasAudio: boolean
  musicEnabled: boolean
  /** Source time of the video element, used to place the playhead. */
  currentTime: number
  onSeek: (sourceSec: number) => void
}

type DragMode = 'start' | 'end' | 'move'

interface DragState {
  index: number
  mode: DragMode
  startX: number
  original: Segment
  pixelsPerSecond: number
}

/**
 * Multi-lane timeline for one short. The Video lane lays the cuts end to end in output time; dragging
 * a cut's edges trims it in source time, and dragging its body slides the window along the source.
 */
export function Timeline({
  segments,
  onChange,
  captions,
  sourceDurationSec,
  hasAudio,
  musicEnabled,
  currentTime,
  onSeek
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  // The newest segments written during a drag. Pointer-up reads this, not the render's closure, because
  // a release can arrive before React has re-rendered with the last move.
  const latestRef = useRef<Segment[]>(segments)

  const total = totalOutputSec(segments)
  const trackWidth = Math.max(MIN_TRACK_WIDTH, secondsToPixels(total, pixelsPerSecond) + 40)
  const starts = outputStarts(segments)
  const step = rulerStep(pixelsPerSecond)
  const ticks: number[] = []
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t)
  const playhead = sourceToOutput(segments, currentTime)
  const captionBlocks = remapCaptions(captions, segments)

  const beginDrag = (e: ReactPointerEvent<HTMLElement>, index: number, mode: DragMode): void => {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { index, mode, startX: e.clientX, original: segments[index], pixelsPerSecond }
    latestRef.current = segments
    suppressClickRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX) suppressClickRef.current = true
    const deltaSec = pixelsToSeconds(dx, drag.pixelsPerSecond)
    const orig = drag.original
    const next =
      drag.mode === 'start'
        ? trimStart(orig, deltaSec)
        : drag.mode === 'end'
          ? trimEnd(orig, deltaSec, sourceDurationSec)
          : moveSegment(orig, deltaSec, sourceDurationSec)
    const updated = latestRef.current.map((s, i) => (i === drag.index ? next : s))
    latestRef.current = updated
    onChange(updated)
  }

  const endDrag = (): void => {
    if (!dragRef.current) return
    dragRef.current = null
    // Overlaps can appear mid-drag; tidy them once the pointer is released.
    onChange(normalizeSegments(latestRef.current, sourceDurationSec))
  }

  /** Click on a lane or the ruler seeks the source video to that output moment. */
  const seekFromTrack = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    if (px < 0) return
    onSeek(outputToSource(segments, pixelsToSeconds(px, pixelsPerSecond)))
  }

  const zoom = (factor: number): void => setPixelsPerSecond((p) => clampPixelsPerSecond(p * factor))

  return (
    <section className={styles.timeline} aria-label="Timeline">
      <div className={styles.toolbar}>
        <span className={`mono ${styles.total}`}>{fmt(total)} in short</span>
        <span className="muted">Drag cut edges to trim. Drag a cut to slide it. Click to seek.</span>
        <span className={styles.zoom}>
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.5)} disabled={pixelsPerSecond <= 4}>
            −
          </button>
          <button aria-label="Zoom in" onClick={() => zoom(1.5)} disabled={pixelsPerSecond >= 80}>
            +
          </button>
        </span>
      </div>

      <div className={styles.scroll}>
        <div
          className={styles.canvas}
          style={{ width: LABEL_WIDTH + trackWidth }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={`${styles.row} ${styles.ruler}`}>
            <div className={styles.laneLabel} />
            <div className={`${styles.lane} ${styles.rulerLane}`} onClick={seekFromTrack}>
              {ticks.map((t) => (
                <span key={t} className={`mono ${styles.tick}`} style={{ left: secondsToPixels(t, pixelsPerSecond) }}>
                  {fmt(t)}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.laneLabel}>Video</div>
            <div className={styles.lane} onClick={seekFromTrack}>
              {segments.map((s, i) => {
                const left = secondsToPixels(starts[i], pixelsPerSecond)
                const width = secondsToPixels(s.endSec - s.startSec, pixelsPerSecond)
                return (
                  <div key={i} className={`${styles.block} ${styles.cut}`} data-tone={(i % 3) + 1} style={{ left, width }}>
                    <span className={styles.handle} aria-label={`Cut ${i + 1} start`} onPointerDown={(e) => beginDrag(e, i, 'start')} />
                    <span className={styles.body} onPointerDown={(e) => beginDrag(e, i, 'move')}>
                      Cut {i + 1} · {fmt(s.startSec)}–{fmt(s.endSec)}
                    </span>
                    <span className={styles.handle} aria-label={`Cut ${i + 1} end`} onPointerDown={(e) => beginDrag(e, i, 'end')} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.laneLabel}>Captions</div>
            <div className={styles.lane} onClick={seekFromTrack}>
              {captionBlocks.map((c, i) => (
                <div
                  key={i}
                  className={`${styles.block} ${styles.caption}`}
                  style={{
                    left: secondsToPixels(c.startSec, pixelsPerSecond),
                    width: Math.max(4, secondsToPixels(c.endSec - c.startSec, pixelsPerSecond))
                  }}
                  title={c.text}
                >
                  {c.text}
                </div>
              ))}
            </div>
          </div>

          {hasAudio && (
            <div className={styles.row}>
              <div className={styles.laneLabel}>Voice</div>
              <div className={styles.lane} onClick={seekFromTrack}>
                <div className={`${styles.block} ${styles.voice}`} style={{ left: 0, width: secondsToPixels(total, pixelsPerSecond) }}>
                  Source audio
                </div>
              </div>
            </div>
          )}

          {musicEnabled && (
            <div className={styles.row}>
              <div className={styles.laneLabel}>Music</div>
              <div className={styles.lane} onClick={seekFromTrack}>
                <div className={`${styles.block} ${styles.music}`} style={{ left: 0, width: secondsToPixels(total, pixelsPerSecond) }}>
                  Music bed, ducked under speech, 1.5s fade out
                </div>
              </div>
            </div>
          )}

          {playhead !== null && (
            <div className={styles.playhead} style={{ left: LABEL_WIDTH + secondsToPixels(playhead, pixelsPerSecond) }} aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  )
}
