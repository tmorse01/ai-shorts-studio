import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { cutEnd, cutLength, remapCaptions, type Caption, type TimelineCut } from '../../shared/timeline'
import {
  DEFAULT_PIXELS_PER_SECOND,
  SNAP_PX,
  clampPixelsPerSecond,
  pixelsToSeconds,
  rulerStep,
  secondsToPixels,
  snapDelta
} from '../../shared/timeline-math'
import type { MusicClip } from '../../shared/types'
import { fmt } from '../util'
import { MUSIC_DRAG_TYPE } from '../media-drag'
import { cutAt } from './preview-math'
import { moveCut, deleteCuts, snapTargets, splitCut, trimCut } from './timeline-model'
import { clampResizeDelta, moveMusicClips, removeMusicClip, resizeMusicClip, splitMusicClip } from './music-clips'
import { useClipDrag } from './useClipDrag'
import styles from './Timeline.module.css'

const LABEL_WIDTH = 84
const MIN_TRACK_WIDTH = 600

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
  segments: TimelineCut[]
  onChange: (next: TimelineCut[]) => void
  /** How long the short is. The timeline is this long, whatever the clips cover. */
  lengthSec: number
  /** Captions in source time, as the draft holds them. They are shown where their cuts sit. */
  captions: Caption[]
  sourceDurationSec: number
  hasAudio: boolean
  musicClips: TimelineMusicClip[]
  onMusicClipsChange: (next: MusicClip[]) => void
  /** A music library asset was dropped on the Music lane, at this point on the short's timeline. */
  onAssignMusic: (assetId: string, atSec: number) => void
  /** A drag or a keyboard edit starts and ends here, so everything it changes is one undo step. */
  onGestureStart: () => void
  onGestureEnd: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Where the playhead is on the timeline, in seconds. */
  playheadSec: number
  /** A click on a lane moves the playhead to that point on the timeline. */
  onSeekOutput: (sec: number) => void
}

/*
 * Every clip is an item with the same behaviour: click selects (Shift or Ctrl adds), drag the body to move,
 * drag an edge to trim, S splits at the playhead, Delete removes. Selection keys tell the lanes apart:
 * `v:<index>` for a video cut, `m:<id>` for a music clip.
 */
const videoKey = (index: number): string => `v:${index}`
const musicKey = (id: string): string => `m:${id}`

interface BasePayload {
  key: string
  additive: boolean
  pps: number
  snap: boolean
  targets: number[]
}

type Payload =
  | (BasePayload & { kind: 'cut-move'; index: number; cuts: TimelineCut[]; lengthSec: number })
  | (BasePayload & {
      kind: 'cut-trim'
      index: number
      edge: 'start' | 'end'
      edgeSec: number
      cuts: TimelineCut[]
      lengthSec: number
      sourceDurationSec: number
    })
  | (BasePayload & { kind: 'music-move'; ids: string[]; groupKeys: string[]; grabbed: MusicClip; all: MusicClip[] })
  | (BasePayload & {
      kind: 'music-trim'
      edge: 'start' | 'end'
      edgeSec: number
      orig: MusicClip
      trackSec: number
      others: MusicClip[]
      all: MusicClip[]
    })

/** The selection after a plain click, or a Shift or Ctrl click that adds or removes one item. */
function applyClick(sel: Set<string>, key: string, additive: boolean): Set<string> {
  if (!additive) return new Set([key])
  const next = new Set(sel)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function Timeline({
  segments,
  onChange,
  lengthSec,
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
  playheadSec,
  onSeekOutput
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [musicDropping, setMusicDropping] = useState(false)
  const [selection, setSelectionState] = useState<Set<string>>(() => new Set())
  // Mirrors the selection, so a press reads the latest one even before React re-renders.
  const selRef = useRef(selection)
  const setSelection = (next: Set<string>): void => {
    selRef.current = next
    setSelectionState(next)
  }

  const plainClips = musicClips.map(toClip)
  const captionBlocks = remapCaptions(captions, segments)
  // The short's own length sets the canvas. Music clips past it still show, so the canvas also covers them.
  const musicEndSec = plainClips.reduce((end, c) => Math.max(end, c.startSec + c.lengthSec), 0)
  const trackWidth = Math.max(MIN_TRACK_WIDTH, secondsToPixels(Math.max(lengthSec, musicEndSec), pixelsPerSecond) + 40)
  const step = rulerStep(pixelsPerSecond)
  const ticks: number[] = []
  for (let t = 0; t <= lengthSec + 1e-6; t += step) ticks.push(t)

  const onMove = (dx: number, p: Payload): void => {
    const d0 = pixelsToSeconds(dx, p.pps)
    const thresholdSec = SNAP_PX / p.pps
    switch (p.kind) {
      case 'cut-move': {
        // A cut moves along the timeline. Its footage does not change, and blank space is left where it was.
        const cut = p.cuts[p.index]
        const d = p.snap ? snapDelta([cut.atSec, cutEnd(cut)], d0, p.targets, thresholdSec) : d0
        onChange(moveCut(p.cuts, p.index, d, p.lengthSec))
        return
      }
      case 'cut-trim': {
        // Trimming one edge keeps the other where it is on the timeline.
        const d = p.snap ? snapDelta([p.edgeSec], d0, p.targets, thresholdSec) : d0
        onChange(trimCut(p.cuts, p.index, p.edge, d, p.sourceDurationSec, p.lengthSec))
        return
      }
      case 'music-move': {
        const d = p.snap ? snapDelta([p.grabbed.startSec, p.grabbed.startSec + p.grabbed.lengthSec], d0, p.targets, thresholdSec) : d0
        onMusicClipsChange(moveMusicClips(p.all, p.ids, d))
        return
      }
      case 'music-trim': {
        const snapped = p.snap ? snapDelta([p.edgeSec], d0, p.targets, thresholdSec) : d0
        const d = clampResizeDelta(p.orig, p.edge, snapped, p.others)
        const resized = resizeMusicClip(p.orig, p.edge, d, p.trackSec)
        onMusicClipsChange(p.all.map((c) => (c.id === p.orig.id ? resized : c)))
        return
      }
    }
  }

  const onEnd = (p: Payload, moved: boolean): void => {
    if (p.kind === 'cut-move' || p.kind === 'cut-trim') {
      // The cuts were written as the drag went. Release only settles the selection.
      setSelection(moved ? new Set([videoKey(p.index)]) : applyClick(selRef.current, p.key, p.additive))
      return
    }
    if (moved) {
      setSelection(p.kind === 'music-move' ? new Set(p.groupKeys) : new Set([p.key]))
    } else {
      setSelection(applyClick(selRef.current, p.key, p.additive))
    }
  }

  const { bind, consumeClick } = useClipDrag<Payload>({ onMove, onEnd }, onGestureStart, onGestureEnd)

  /** The Shift or Ctrl state decides whether a press adds to the selection, and Alt turns snapping off. */
  const pressFlags = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }) => ({
    additive: e.shiftKey || e.ctrlKey,
    snap: !e.altKey
  })

  const cutPayload = (index: number, mode: 'move' | 'start' | 'end', e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }): Payload => {
    const cut = segments[index]
    const base: BasePayload = {
      key: videoKey(index),
      pps: pixelsPerSecond,
      targets: snapTargets(segments, plainClips, playheadSec, lengthSec),
      ...pressFlags(e)
    }
    if (mode === 'move') {
      return { ...base, kind: 'cut-move', index, cuts: segments, lengthSec }
    }
    const edgeSec = mode === 'start' ? cut.atSec : cutEnd(cut)
    return { ...base, kind: 'cut-trim', index, edge: mode, edgeSec, cuts: segments, lengthSec, sourceDurationSec }
  }

  const musicPayload = (clip: TimelineMusicClip, mode: 'move' | 'start' | 'end', e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }): Payload => {
    const key = musicKey(clip.id)
    const flags = pressFlags(e)
    if (mode === 'move') {
      // Dragging a selected clip moves the whole selection. Dragging an unselected one moves only it.
      const group = flags.additive ? new Set([...selRef.current, key]) : selRef.current.has(key) ? selRef.current : new Set([key])
      const groupKeys = [...group]
      const ids = groupKeys.filter((k) => k.startsWith('m:')).map((k) => k.slice(2))
      const others = plainClips.filter((c) => !ids.includes(c.id))
      return {
        kind: 'music-move',
        key,
        pps: pixelsPerSecond,
        ...flags,
        targets: snapTargets(segments, others, playheadSec, lengthSec),
        ids,
        groupKeys,
        grabbed: toClip(clip),
        all: plainClips
      }
    }
    const others = plainClips.filter((c) => c.id !== clip.id)
    const edgeSec = mode === 'start' ? clip.startSec : clip.startSec + clip.lengthSec
    return {
      kind: 'music-trim',
      key,
      pps: pixelsPerSecond,
      ...flags,
      targets: snapTargets(segments, others, playheadSec, lengthSec),
      edge: mode,
      edgeSec,
      orig: toClip(clip),
      trackSec: clip.trackDurationSec,
      others,
      all: plainClips
    }
  }

  /** Split what is selected at the playhead, or else what is under it. One keypress is one undo step. */
  const splitAtPlayhead = (): boolean => {
    const sel = selRef.current
    const wantsVideo = sel.size === 0 || [...sel].some((k) => k.startsWith('v:'))
    const wantsMusic = sel.size === 0 || [...sel].some((k) => k.startsWith('m:'))
    const selectedMusic = new Set([...sel].filter((k) => k.startsWith('m:')).map((k) => k.slice(2)))

    let nextCuts: TimelineCut[] | null = null
    let rightVideo: number | null = null
    if (wantsVideo) {
      // The cut under the playhead, among the selected ones when there is a selection.
      const under = cutAt(segments, playheadSec)
      const index = under >= 0 && (sel.size === 0 || sel.has(videoKey(under))) ? under : -1
      const split = index >= 0 ? splitCut(segments, index, playheadSec) : null
      if (split) {
        nextCuts = split.cuts
        rightVideo = split.rightIndex
      }
    }

    let nextMusic: MusicClip[] | null = null
    const rightIds: string[] = []
    if (wantsMusic) {
      let clips = plainClips
      for (const clip of plainClips) {
        const selectedHere = sel.size === 0 || selectedMusic.has(clip.id)
        if (!selectedHere || !(playheadSec > clip.startSec && playheadSec < clip.startSec + clip.lengthSec)) continue
        const rightId = crypto.randomUUID()
        const result = splitMusicClip(clips, clip.id, playheadSec, rightId)
        if (result) {
          clips = result.clips
          rightIds.push(rightId)
        }
      }
      if (rightIds.length > 0) nextMusic = clips
    }

    if (!nextCuts && !nextMusic) return false
    onGestureStart()
    if (nextCuts) onChange(nextCuts)
    if (nextMusic) onMusicClipsChange(nextMusic)
    onGestureEnd()
    const picked = new Set<string>()
    if (rightVideo !== null) picked.add(videoKey(rightVideo))
    rightIds.forEach((id) => picked.add(musicKey(id)))
    setSelection(picked)
    return true
  }

  /** Remove what is selected. The short keeps at least one cut. */
  const deleteSelected = (): boolean => {
    const sel = selRef.current
    if (sel.size === 0) return false
    const videoIndexes = [...sel].filter((k) => k.startsWith('v:')).map((k) => Number(k.slice(2)))
    const musicIds = new Set([...sel].filter((k) => k.startsWith('m:')).map((k) => k.slice(2)))
    const nextCuts = videoIndexes.length > 0 ? deleteCuts(segments, videoIndexes) : segments
    const removedMusic = plainClips.filter((c) => musicIds.has(c.id))
    const cutsChanged = nextCuts !== segments
    if (!cutsChanged && removedMusic.length === 0) return false
    let clips = plainClips
    for (const c of removedMusic) clips = removeMusicClip(clips, c.id)
    onGestureStart()
    if (cutsChanged) onChange(nextCuts)
    if (removedMusic.length > 0) onMusicClipsChange(clips)
    onGestureEnd()
    setSelection(new Set())
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
  }, [segments, musicClips, selection, playheadSec])

  /** A click on a lane moves the playhead to that point on the timeline. */
  const seekFromLane = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    if (px < 0) return
    onSeekOutput(Math.min(lengthSec, pixelsToSeconds(px, pixelsPerSecond)))
  }

  /** A click on the empty part of a lane clears the selection, then moves the playhead. */
  const onLaneClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    setSelection(new Set())
    seekFromLane(e)
  }

  /** Items stop clicks from reaching the lane (which would move the playhead), and ignore the click that ends a drag. */
  const stopItemClick = (e: ReactMouseEvent<HTMLElement>): void => {
    e.stopPropagation()
    consumeClick()
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
        <span className={`mono ${styles.total}`}>{fmt(lengthSec)} short</span>
        <span className="muted">
          Click selects, drag moves, drag an edge trims, S splits at the playhead, Delete removes. Hold Alt to skip
          snapping.
        </span>
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
        <div className={styles.canvas} style={{ width: LABEL_WIDTH + trackWidth }}>
          <div className={`${styles.row} ${styles.ruler}`}>
            <div className={styles.laneLabel} />
            <div className={`${styles.lane} ${styles.rulerLane}`} onClick={seekFromLane}>
              {ticks.map((t) => (
                <span key={t} className={`mono ${styles.tick}`} style={{ left: secondsToPixels(t, pixelsPerSecond) }}>
                  {fmt(t)}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.laneLabel}>Video</div>
            <div className={styles.lane} onClick={onLaneClick}>
              {segments.map((s, i) => {
                const left = secondsToPixels(s.atSec, pixelsPerSecond)
                const width = secondsToPixels(cutLength(s), pixelsPerSecond)
                const selected = selection.has(videoKey(i))
                return (
                  <div
                    key={i}
                    className={`${styles.block} ${styles.cut} ${selected ? styles.cutSelected : ''}`}
                    data-tone={(i % 3) + 1}
                    style={{ left, width }}
                    onClick={stopItemClick}
                  >
                    <span className={styles.handle} aria-label={`Cut ${i + 1} start`} {...bind((e) => cutPayload(i, 'start', e))} />
                    <span className={styles.body} {...bind((e) => cutPayload(i, 'move', e))}>
                      Cut {i + 1} · {fmt(s.startSec)}–{fmt(s.endSec)}
                    </span>
                    <span className={styles.handle} aria-label={`Cut ${i + 1} end`} {...bind((e) => cutPayload(i, 'end', e))} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.laneLabel}>Captions</div>
            <div className={styles.lane} onClick={seekFromLane}>
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
              <div className={styles.lane} onClick={seekFromLane}>
                {segments.map((s, i) => (
                  <div
                    key={i}
                    className={`${styles.block} ${styles.voice}`}
                    style={{ left: secondsToPixels(s.atSec, pixelsPerSecond), width: secondsToPixels(cutLength(s), pixelsPerSecond) }}
                  >
                    Source audio
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.laneLabel}>Music</div>
            <div
              className={styles.lane}
              onClick={onLaneClick}
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
              {musicClips.map((c) => {
                const selected = selection.has(musicKey(c.id))
                return (
                  <div
                    key={c.id}
                    className={`${styles.block} ${styles.music} ${selected ? styles.musicSelected : ''}`}
                    style={{ left: secondsToPixels(c.startSec, pixelsPerSecond), width: secondsToPixels(c.lengthSec, pixelsPerSecond) }}
                    title={`${c.name}, ${fmt(c.trackStartSec)} to ${fmt(c.trackStartSec + c.lengthSec)} of the track`}
                    onClick={stopItemClick}
                  >
                    <span
                      className={`${styles.musicEdge} ${styles.musicEdgeStart}`}
                      aria-label={`${c.name} start`}
                      {...bind((e) => musicPayload(c, 'start', e))}
                    />
                    <span className={styles.musicBody} {...bind((e) => musicPayload(c, 'move', e))}>
                      {c.name} · {fmt(c.trackStartSec)}–{fmt(c.trackStartSec + c.lengthSec)}
                    </span>
                    <span
                      className={`${styles.musicEdge} ${styles.musicEdgeEnd}`}
                      aria-label={`${c.name} end`}
                      {...bind((e) => musicPayload(c, 'end', e))}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.playhead} style={{ left: LABEL_WIDTH + secondsToPixels(playheadSec, pixelsPerSecond) }} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
