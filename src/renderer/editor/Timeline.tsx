import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
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
import type { MusicClip } from '../../shared/types'
import { fmt } from '../util'
import { MUSIC_DRAG_TYPE } from '../media-drag'
import { musicClipAt, removeMusicClip, resizeMusicClip, splitMusicClip } from './music-clips'
import styles from './Timeline.module.css'

const LABEL_WIDTH = 84
const MIN_TRACK_WIDTH = 600
const DRAG_CLICK_THRESHOLD_PX = 3

/** A music clip with the library name and length of its track, for the label and the resize limit. */
export interface TimelineMusicClip extends MusicClip {
  name: string
  trackDurationSec: number
}

/** The part of a timeline clip that is saved. The display fields are not. */
function toClip({ id, assetId, startSec, trackStartSec, lengthSec }: TimelineMusicClip): MusicClip {
  return { id, assetId, startSec, trackStartSec, lengthSec }
}

export interface TimelineProps {
  segments: Segment[]
  onChange: (next: Segment[]) => void
  captions: Caption[]
  sourceDurationSec: number
  hasAudio: boolean
  musicClips: TimelineMusicClip[]
  onMusicClipsChange: (next: MusicClip[]) => void
  /** A music library asset was dropped on the Music lane, at this point on the short's timeline. */
  onAssignMusic: (assetId: string, atSec: number) => void
  /** A drag starts and ends here, so everything it changes is one undo step. */
  onGestureStart: () => void
  onGestureEnd: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
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

interface MusicResizeState {
  edge: 'start' | 'end'
  startX: number
  pixelsPerSecond: number
  original: MusicClip
  trackDurationSec: number
  /** The other clips as they were when the drag began, so each move starts from the same place. */
  others: MusicClip[]
}

/**
 * Multi-lane timeline for one short. The Video lane lays the cuts end to end in output time; dragging
 * a cut's edges trims it in source time, and dragging its body slides the window along the source.
 * The Music lane holds music clips. Drop a track to add it, click a clip to select it, drag its edges to
 * trim or extend it, press S to split the selected clip (or the one under the playhead) at the playhead,
 * and Delete to remove a clip.
 */
export function Timeline({
  segments,
  onChange,
  captions,
  sourceDurationSec,
  hasAudio,
  musicClips,
  onMusicClipsChange,
  onAssignMusic,
  onGestureStart,
  onGestureEnd,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  currentTime,
  onSeek
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [musicDropping, setMusicDropping] = useState(false)
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const musicResizeRef = useRef<MusicResizeState | null>(null)
  const suppressClickRef = useRef(false)
  // The newest segments written during a drag. Pointer-up reads this, not the render's closure, because
  // a release can arrive before React has re-rendered with the last move.
  const latestRef = useRef<Segment[]>(segments)

  const total = totalOutputSec(segments)
  const plainClips = musicClips.map(toClip)
  // Music clips past the end of the short still show, so the canvas widens to the furthest one.
  const musicEndSec = plainClips.reduce((end, c) => Math.max(end, c.startSec + c.lengthSec), 0)
  const trackWidth = Math.max(MIN_TRACK_WIDTH, secondsToPixels(Math.max(total, musicEndSec), pixelsPerSecond) + 40)
  const starts = outputStarts(segments)
  const step = rulerStep(pixelsPerSecond)
  const ticks: number[] = []
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t)
  const playhead = sourceToOutput(segments, currentTime)
  const captionBlocks = remapCaptions(captions, segments)

  // A clip that was deleted elsewhere (or by undo) must not stay selected.
  const selected = musicClips.find((c) => c.id === selectedMusicId) ?? null

  /** Split the selected clip, or the one under the playhead, at the playhead. */
  const splitAtPlayhead = (): boolean => {
    if (playhead === null) return false
    const target = (selected && toClip(selected)) ?? musicClipAt(plainClips, playhead)
    if (!target) return false
    const result = splitMusicClip(plainClips, target.id, playhead, crypto.randomUUID())
    if (!result) return false
    onMusicClipsChange(result.clips)
    setSelectedMusicId(result.rightId)
    return true
  }

  const deleteSelected = (): boolean => {
    if (!selected) return false
    onMusicClipsChange(removeMusicClip(plainClips, selected.id))
    setSelectedMusicId(null)
    return true
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        if (splitAtPlayhead()) e.preventDefault()
      } else if (key === 'delete' || key === 'backspace') {
        if (deleteSelected()) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The handlers read the latest clips, selection and playhead, so re-bind when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicClips, selectedMusicId, playhead])

  const beginDrag = (e: ReactPointerEvent<HTMLElement>, index: number, mode: DragMode): void => {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { index, mode, startX: e.clientX, original: segments[index], pixelsPerSecond }
    latestRef.current = segments
    suppressClickRef.current = false
    onGestureStart()
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
    onGestureEnd()
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

  /** A click on the empty part of the Music lane clears the selection, then seeks as any lane does. */
  const onMusicLaneClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    setSelectedMusicId(null)
    seekFromTrack(e)
  }

  /** Drag a clip's start or end edge. The clip's own edge moves; the others stay as they were. */
  const beginMusicResize = (e: ReactPointerEvent<HTMLSpanElement>, clip: TimelineMusicClip, edge: 'start' | 'end'): void => {
    e.stopPropagation()
    e.preventDefault()
    musicResizeRef.current = {
      edge,
      startX: e.clientX,
      pixelsPerSecond,
      original: toClip(clip),
      trackDurationSec: clip.trackDurationSec,
      others: plainClips.filter((c) => c.id !== clip.id)
    }
    setSelectedMusicId(clip.id)
    onGestureStart()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveMusicResize = (e: ReactPointerEvent<HTMLSpanElement>): void => {
    const drag = musicResizeRef.current
    if (!drag) return
    const deltaSec = pixelsToSeconds(e.clientX - drag.startX, drag.pixelsPerSecond)
    const resized = resizeMusicClip(drag.original, drag.edge, deltaSec, drag.trackDurationSec)
    onMusicClipsChange([...drag.others, resized])
  }

  const endMusicResize = (): void => {
    if (!musicResizeRef.current) return
    musicResizeRef.current = null
    onGestureEnd()
  }

  const zoom = (factor: number): void => setPixelsPerSecond((p) => clampPixelsPerSecond(p * factor))

  const acceptsMusic = (e: ReactDragEvent<HTMLDivElement>): boolean => e.dataTransfer.types.includes(MUSIC_DRAG_TYPE)

  const onMusicDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (!acceptsMusic(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setMusicDropping(true)
  }

  const onMusicDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    setMusicDropping(false)
    if (!acceptsMusic(e)) return
    e.preventDefault()
    const assetId = e.dataTransfer.getData(MUSIC_DRAG_TYPE)
    if (!assetId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const atSec = Math.max(0, pixelsToSeconds(e.clientX - rect.left, pixelsPerSecond))
    onAssignMusic(assetId, atSec)
  }

  return (
    <section className={styles.timeline} aria-label="Timeline">
      <div className={styles.toolbar}>
        <span className={`mono ${styles.total}`}>{fmt(total)} in short</span>
        <span className="muted">Drag cut edges to trim. Drag a cut to slide it. Click to seek.</span>
        <span className={styles.zoom}>
          <button aria-label="Undo" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
        </span>
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

          <div className={styles.row}>
            <div className={styles.laneLabel}>Music</div>
            <div
              className={styles.lane}
              onClick={onMusicLaneClick}
              onDragOver={onMusicDragOver}
              onDragLeave={() => setMusicDropping(false)}
              onDrop={onMusicDrop}
              style={musicDropping ? { outline: '1px dashed var(--text-2)', outlineOffset: -1 } : undefined}
            >
              {musicClips.length === 0 && (
                <span className={`muted ${styles.musicHint}`}>
                  Drag a track here from the Media panel. Click a clip and press S to split it at the playhead, then Delete.
                </span>
              )}
              {musicClips.map((c) => (
                <div
                  key={c.id}
                  className={`${styles.block} ${styles.music} ${c.id === selected?.id ? styles.musicSelected : ''}`}
                  style={{ left: secondsToPixels(c.startSec, pixelsPerSecond), width: secondsToPixels(c.lengthSec, pixelsPerSecond) }}
                  title={`${c.name}, ${fmt(c.trackStartSec)} to ${fmt(c.trackStartSec + c.lengthSec)} of the track`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedMusicId(c.id)
                  }}
                >
                  <span
                    className={`${styles.musicEdge} ${styles.musicEdgeStart}`}
                    aria-label={`${c.name} start`}
                    onPointerDown={(e) => beginMusicResize(e, c, 'start')}
                    onPointerMove={moveMusicResize}
                    onPointerUp={endMusicResize}
                    onPointerCancel={endMusicResize}
                  />
                  {c.name} · {fmt(c.trackStartSec)}–{fmt(c.trackStartSec + c.lengthSec)}
                  <span
                    className={`${styles.musicEdge} ${styles.musicEdgeEnd}`}
                    aria-label={`${c.name} end`}
                    onPointerDown={(e) => beginMusicResize(e, c, 'end')}
                    onPointerMove={moveMusicResize}
                    onPointerUp={endMusicResize}
                    onPointerCancel={endMusicResize}
                  />
                </div>
              ))}
            </div>
          </div>

          {playhead !== null && (
            <div className={styles.playhead} style={{ left: LABEL_WIDTH + secondsToPixels(playhead, pixelsPerSecond) }} aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  )
}
