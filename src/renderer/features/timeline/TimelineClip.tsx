import type { JSX, PointerEvent } from 'react'
import { Lock } from 'lucide-react'
import { filmstripPlan, FILMSTRIP_FILE } from '@shared/media/thumbs'
import type { MediaRef, Moment } from '@shared/project/schema'
import type { Clip, TrackKind } from '@shared/timeline/timeline'
import {
  clipBox,
  clipLabel,
  fadeHandleX,
  fadeRampPoints,
  filmstripTiles,
  sourceStrip,
  type LaneRange
} from './clipView'
import { useThumb } from './useThumb'
import styles from './TimelineClip.module.css'

// The clip body height. The lane is taller, so the clip sits in it with a small gap.
export const CLIP_HEIGHT_PX = 36
// The linked audio strip along the bottom of a video clip.
export const LINKED_STRIP_PX = 10

// The audio clip split off a video clip, with the media it plays from.
export interface LinkedAudio {
  clip: Clip
  media?: MediaRef
  offline: boolean
}

export interface TimelineClipProps {
  clip: Clip
  kind: TrackKind
  locked: boolean
  // The clip itself is locked (see setClipLocked). Shows a lock badge on the clip.
  clipLocked?: boolean
  selected: boolean
  pxPerMs: number
  // The part of the lane on screen. Filmstrip tiles are only built for this range.
  range: LaneRange
  media?: MediaRef
  // The project's moments, so a clip from a moment shows the moment's current name.
  moments?: readonly Moment[]
  offline: boolean
  // The project folder the cache lives in. Without it, clips show no thumbnails.
  projectFolder?: string
  linked?: LinkedAudio
  // The gain line of a music clip, as SVG points (see gainLinePoints). Absent on other clips.
  gainLine?: string
  // Pointer down starts a press: select, or start a drag. The pane handles the rest.
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  // Pointer down on a trim handle. Absent on a locked track, which shows no handles.
  onTrimPointerDown?: (edge: 'start' | 'end', event: PointerEvent<HTMLDivElement>) => void
  // Pointer down on a fade handle of an audio clip. Absent on a locked track, which shows no fades.
  onFadePointerDown?: (edge: 'in' | 'out', event: PointerEvent<HTMLDivElement>) => void
  // Keyboard selection, for Enter and Space.
  onSelect: () => void
}

// One clip on a lane. A video clip shows a filmstrip, an audio clip a waveform, and a video clip with
// linked audio a waveform strip along its bottom. Offline media keeps the clip but shows that it is
// missing, and loads no thumbnails.
export function TimelineClip({
  clip,
  kind,
  locked,
  clipLocked = false,
  selected,
  pxPerMs,
  range,
  media,
  moments,
  offline,
  projectFolder,
  linked,
  gainLine,
  onPointerDown,
  onTrimPointerDown,
  onFadePointerDown,
  onSelect
}: TimelineClipProps): JSX.Element {
  const box = clipBox(clip, pxPerMs)
  const label = clipLabel(clip, media?.fileName, moments)
  const sourceId = offline ? undefined : clip.mediaId
  const linkedOffline = linked?.offline ?? false

  const filmstrip = useThumb(projectFolder, sourceId, kind === 'video' ? FILMSTRIP_FILE : undefined)
  const waveform = useThumb(projectFolder, sourceId, kind === 'audio' ? 'waveform.png' : undefined)
  const linkedWave = useThumb(
    projectFolder,
    linkedOffline ? undefined : linked?.clip.mediaId,
    linked ? 'waveform.png' : undefined
  )

  const pieces: JSX.Element[] = []
  if (filmstrip && media?.durationMs) {
    const plan = filmstripPlan(media.durationMs / 1000)
    // A frame keeps its aspect ratio at the clip's height, so the tile width follows the sprite.
    const cellW =
      (CLIP_HEIGHT_PX * (filmstrip.width / plan.columns)) / (filmstrip.height / plan.rows)
    const tiles = filmstripTiles({
      sourceInMs: clip.sourceInMs,
      plan,
      pxPerMs,
      tileWidthPx: cellW,
      widthPx: box.widthPx,
      fromPx: range.fromPx - box.leftPx,
      toPx: range.toPx - box.leftPx
    })
    tiles.forEach((tile) =>
      pieces.push(
        <div
          key={tile.leftPx}
          className={styles.tile}
          style={{
            left: tile.leftPx,
            width: cellW,
            height: CLIP_HEIGHT_PX,
            backgroundImage: `url("${filmstrip.src}")`,
            backgroundSize: `${plan.columns * cellW}px ${plan.rows * CLIP_HEIGHT_PX}px`,
            backgroundPosition: `${-tile.col * cellW}px ${-tile.row * CLIP_HEIGHT_PX}px`
          }}
        />
      )
    )
  }

  const bodyWave = waveform ? sourceStrip(clip, media?.durationMs, pxPerMs) : null
  const linkedStrip =
    linkedWave && linked ? sourceStrip(clip, linked.media?.durationMs, pxPerMs) : null

  const classes = [
    styles.clip,
    selected ? styles.selected : '',
    locked ? styles.locked : '',
    offline ? styles.offline : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}${offline ? ', offline' : ''}${locked ? ', locked' : ''}${clipLocked ? ', clip locked' : ''}`}
      className={classes}
      data-kind={kind}
      style={{ left: box.leftPx, width: box.widthPx, height: CLIP_HEIGHT_PX }}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      {pieces}
      {clipLocked ? (
        <span className={styles.lockBadge} aria-hidden="true">
          <Lock size={12} strokeWidth={1.75} />
        </span>
      ) : null}
      {bodyWave ? (
        <div
          className={styles.wave}
          style={{
            backgroundImage: `url("${waveform?.src}")`,
            backgroundSize: `${bodyWave.imageWidthPx}px 100%`,
            backgroundPosition: `${bodyWave.offsetPx}px 0`
          }}
        />
      ) : null}
      {gainLine !== undefined ? (
        <svg
          className={styles.gainLine}
          viewBox={`0 0 ${box.widthPx} ${CLIP_HEIGHT_PX}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline points={gainLine} />
        </svg>
      ) : null}
      {linkedStrip && linkedWave ? (
        <div
          className={styles.linkedWave}
          style={{
            height: LINKED_STRIP_PX,
            backgroundImage: `url("${linkedWave.src}")`,
            backgroundSize: `${linkedStrip.imageWidthPx}px 100%`,
            backgroundPosition: `${linkedStrip.offsetPx}px 0`
          }}
        />
      ) : null}
      {onFadePointerDown ? (
        <>
          <svg
            className={styles.fadeLine}
            viewBox={`0 0 ${box.widthPx} ${CLIP_HEIGHT_PX}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={fadeRampPoints(clip, pxPerMs, CLIP_HEIGHT_PX)} />
          </svg>
          <div
            className={styles.fadeHandle}
            data-fade="in"
            aria-hidden="true"
            style={{ left: fadeHandleX(clip, 'in', pxPerMs) }}
            onPointerDown={(event) => onFadePointerDown('in', event)}
          />
          <div
            className={styles.fadeHandle}
            data-fade="out"
            aria-hidden="true"
            style={{ left: fadeHandleX(clip, 'out', pxPerMs) }}
            onPointerDown={(event) => onFadePointerDown('out', event)}
          />
        </>
      ) : null}
      {onTrimPointerDown ? (
        <>
          <div
            className={`${styles.handle} ${styles.handleStart}`}
            data-edge="start"
            aria-hidden="true"
            onPointerDown={(event) => onTrimPointerDown('start', event)}
          />
          <div
            className={`${styles.handle} ${styles.handleEnd}`}
            data-edge="end"
            aria-hidden="true"
            onPointerDown={(event) => onTrimPointerDown('end', event)}
          />
        </>
      ) : null}
      <span className={styles.label}>{label}</span>
      {offline ? <span className={styles.badge}>Offline</span> : null}
    </div>
  )
}
