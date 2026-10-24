import type { JSX } from 'react'
import { filmstripPlan, FILMSTRIP_FILE } from '@shared/media/thumbs'
import type { MediaRef } from '@shared/project/schema'
import type { Clip, TrackKind } from '@shared/timeline/timeline'
import { clipBox, clipLabel, filmstripTiles, sourceStrip, type LaneRange } from './clipView'
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
  selected: boolean
  pxPerMs: number
  // The part of the lane on screen. Filmstrip tiles are only built for this range.
  range: LaneRange
  media?: MediaRef
  offline: boolean
  // The project folder the cache lives in. Without it, clips show no thumbnails.
  projectFolder?: string
  linked?: LinkedAudio
  onSelect: () => void
}

// One clip on a lane. A video clip shows a filmstrip, an audio clip a waveform, and a video clip with
// linked audio a waveform strip along its bottom. Offline media keeps the clip but shows that it is
// missing, and loads no thumbnails.
export function TimelineClip({
  clip,
  kind,
  locked,
  selected,
  pxPerMs,
  range,
  media,
  offline,
  projectFolder,
  linked,
  onSelect
}: TimelineClipProps): JSX.Element {
  const box = clipBox(clip, pxPerMs)
  const label = clipLabel(clip, media?.fileName)
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
      aria-label={`${label}${offline ? ', offline' : ''}${locked ? ', locked' : ''}`}
      className={classes}
      data-kind={kind}
      style={{ left: box.leftPx, width: box.widthPx, height: CLIP_HEIGHT_PX }}
      onPointerDown={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      {pieces}
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
      <span className={styles.label}>{label}</span>
      {offline ? <span className={styles.badge}>Offline</span> : null}
    </div>
  )
}
