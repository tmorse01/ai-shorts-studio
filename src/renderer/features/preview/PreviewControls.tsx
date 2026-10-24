import type { JSX } from 'react'
import { Maximize, Minimize, Pause, Play, Shield, SkipBack, SkipForward } from 'lucide-react'
import { ZOOM_LABELS, ZOOM_MODES, type ZoomMode } from '@shared/preview/previewView'
import { IconButton } from '@renderer/ui/IconButton'
import { Select } from '@renderer/ui/Select'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { playbackStore } from '../playback/playbackStore'
import styles from './PreviewControls.module.css'

const ZOOM_OPTIONS = ZOOM_MODES.map((mode) => ({ value: mode, label: ZOOM_LABELS[mode] }))

export interface PreviewControlsProps {
  // Zoom and the safe-zone overlay only apply to the short's frame, so they are off in Source view.
  shortView: boolean
  zoom: ZoomMode
  onZoomChange: (zoom: ZoomMode) => void
  safeZones: boolean
  onSafeZonesChange: (show: boolean) => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}

// The row under the scrub bar: transport on the left, the safe-zone toggle, zoom and fullscreen on the
// right. Transport works in both views, since playback drives whichever clip is shown.
export function PreviewControls({
  shortView,
  zoom,
  onZoomChange,
  safeZones,
  onSafeZonesChange,
  fullscreen,
  onToggleFullscreen
}: PreviewControlsProps): JSX.Element {
  const playing = usePlaybackStore((state) => state.playing)
  return (
    <div className={styles.controls}>
      <div className={styles.group}>
        <IconButton
          icon={SkipBack}
          label="Step back one frame"
          onClick={() => playbackStore.getState().step(-1)}
        />
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? 'Pause' : 'Play'}
          variant="secondary"
          onClick={() => playbackStore.getState().toggle()}
        />
        <IconButton
          icon={SkipForward}
          label="Step forward one frame"
          onClick={() => playbackStore.getState().step(1)}
        />
      </div>
      <div className={styles.group}>
        <IconButton
          icon={Shield}
          label="Safe-zone overlay"
          aria-pressed={safeZones}
          className={safeZones ? styles.pressed : undefined}
          disabled={!shortView}
          onClick={() => onSafeZonesChange(!safeZones)}
        />
        <span className={styles.zoom}>
          <Select
            aria-label="Zoom"
            options={ZOOM_OPTIONS}
            value={zoom}
            disabled={!shortView}
            onValueChange={(value) => onZoomChange(value as ZoomMode)}
          />
        </span>
        <IconButton
          icon={fullscreen ? Minimize : Maximize}
          label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          onClick={() => void onToggleFullscreen()}
        />
      </div>
    </div>
  )
}
