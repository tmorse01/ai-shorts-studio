import { useEffect, useRef, useState, type CSSProperties, type JSX, type PointerEvent } from 'react'
import { useStore } from 'zustand'
import { hasClips } from '@shared/compositor/frame'
import { DEFAULT_SHORT_DEFAULTS } from '@shared/project/schema'
import {
  ACTUAL_FRAME_SIZE,
  NO_PAN,
  canPan,
  clampPan,
  panBy,
  resolveSafeZones,
  type Point,
  type Size,
  type ZoomMode
} from '@shared/preview/previewView'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { Timeline } from '@shared/timeline/timeline'
import { useAudioPreview } from '../audio/useAudioPreview'
import { CanvasGizmo } from '../compositor/CanvasGizmo'
import { useCanvasGizmo } from '../compositor/useCanvasGizmo'
import { useProjectStore } from '../project/useProjectStore'
import { ScrubBar } from '../playback/ScrubBar'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { EMPTY_TIMELINE } from '../preview/previewFrame'
import { PreviewControls } from '../preview/PreviewControls'
import { SafeZoneOverlay } from '../preview/SafeZoneOverlay'
import { previewSettingsStore, usePreviewSettings } from '../preview/previewSettingsStore'
import { useFullscreen } from '../preview/useFullscreen'
import { useMediaSourceSync } from '../preview/useMediaSourceSync'
import { useVideoPreview } from '../preview/useVideoPreview'
import { TextEditor } from '../text/TextEditor'
import { SourceViewer } from '../source/SourceViewer'
import { ViewModeToggle } from '../source/ViewModeToggle'
import { sourceStore } from '../source/sourceStore'
import { EmptyState } from './EmptyState'
import styles from './PreviewCanvas.module.css'

export interface PreviewCanvasProps {
  timeline?: Timeline
  // The open short. The canvas gizmo edits its layers; with no short open, the frame is view only.
  shortId?: string
}

interface PanDrag {
  pointerId: number
  x: number
  y: number
}

// The centre of the editor: a near-black canvas holding a 9:16 frame, with the scrub bar and the
// preview controls along the bottom edge. In Short view the frame is drawn by the compositor from the
// short's timeline; a short with no clips shows an empty state, and offline footage shows a
// placeholder. In Source view the clip being viewed replaces the frame, and the timeline stays silent
// and idle. A layer is selected and moved on the frame when the short is paused. At 100% zoom, a press
// on empty frame pans the view. The safe-zone overlay is drawn over the frame and never exported.
export function PreviewCanvas({
  timeline = EMPTY_TIMELINE,
  shortId
}: PreviewCanvasProps): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const panDrag = useRef<PanDrag | null>(null)
  const mode = useStore(sourceStore, (state) => state.mode)
  const inShort = mode === 'short'
  const shortTimeline = inShort ? timeline : EMPTY_TIMELINE
  useMediaSourceSync()
  const { offline, droppedFrames } = useVideoPreview(canvasRef, shortTimeline)
  useAudioPreview(shortTimeline, inShort)
  const playing = usePlaybackStore((state) => state.playing)
  const { guides, handlers } = useCanvasGizmo({
    shortId: inShort ? shortId : undefined,
    timeline: shortTimeline,
    frameRef
  })
  const fullscreen = useFullscreen(sectionRef)

  // The short's own settings decide the default for the safe-zone overlay and its platform.
  const defaults = useProjectStore((state) => state.current?.project.defaults)
  const short = useProjectStore((state) =>
    state.current?.project.shorts.find((item) => item.id === shortId)
  )
  const settings = effectiveShortSettings(
    defaults ?? DEFAULT_SHORT_DEFAULTS,
    short?.overrides ?? {}
  )
  const zoom = usePreviewSettings((state) => state.zoom)
  const safeZoneOverride = usePreviewSettings((state) => state.safeZoneOverride)
  const safeZonesOn = resolveSafeZones(safeZoneOverride, settings.safeZones)
  const showSafeZones = inShort && safeZonesOn

  // The viewport is the canvas section. Panning is clamped to it, so it is measured and kept current.
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })
  const [pan, setPan] = useState<Point>(NO_PAN)
  useEffect(() => {
    const element = sectionRef.current
    if (!element) return
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const pannable = canPan(zoom, ACTUAL_FRAME_SIZE, viewport)
  const shownPan = zoom === 'actual' ? clampPan(pan, ACTUAL_FRAME_SIZE, viewport) : NO_PAN
  const frameStyle: CSSProperties | undefined =
    zoom === 'actual'
      ? {
          width: ACTUAL_FRAME_SIZE.width,
          height: ACTUAL_FRAME_SIZE.height,
          transform: `translate(${shownPan.x}px, ${shownPan.y}px)`
        }
      : undefined

  // The playback length follows the short's timeline in Short view only; a source clip sets its own.
  useEffect(() => {
    if (inShort) playbackStore.getState().setDurationMs(timelineDurationMs(timeline))
  }, [timeline, inShort])

  function changeZoom(next: ZoomMode) {
    setPan(NO_PAN)
    previewSettingsStore.getState().setZoom(next)
  }

  // The gizmo gets each press first. A press it does not claim (no pointer capture) pans at 100%.
  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    handlers.onPointerDown(event)
    if (event.button !== 0 || !pannable || event.currentTarget.hasPointerCapture(event.pointerId))
      return
    panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    handlers.onPointerMove(event)
    const drag = panDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = { x: event.clientX - drag.x, y: event.clientY - drag.y }
    panDrag.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY }
    setPan((previous) => panBy(previous, delta, ACTUAL_FRAME_SIZE, viewport))
  }

  function onFramePointerUp(event: PointerEvent<HTMLDivElement>) {
    handlers.onPointerUp(event)
    const drag = panDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    panDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section ref={sectionRef} className={styles.canvas} aria-label="Preview">
      <div className={styles.toggle}>
        <ViewModeToggle />
      </div>
      <div
        ref={frameRef}
        className={pannable ? `${styles.frame} ${styles.pannable}` : styles.frame}
        style={frameStyle}
        role="img"
        aria-label="9:16 preview frame"
        tabIndex={0}
        hidden={!inShort}
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={onFramePointerUp}
        onKeyDown={handlers.onKeyDown}
        onDoubleClick={handlers.onDoubleClick}
      >
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.ratio} aria-hidden="true">
          9:16
        </span>
        <canvas ref={canvasRef} className={styles.video} aria-hidden="true" />
        {showSafeZones ? <SafeZoneOverlay platform={settings.platform} /> : null}
        {inShort && !playing ? <CanvasGizmo guides={guides} /> : null}
        {inShort && !playing && shortId ? <TextEditor shortId={shortId} /> : null}
        {inShort && !hasClips(timeline) ? (
          <div className={styles.overlay}>
            <EmptyState
              title="No clips yet"
              description="Add footage to this short and it will play here."
            />
          </div>
        ) : null}
        {inShort && offline ? (
          <div className={styles.offline} role="status">
            <span className={styles.offlineTitle}>Media offline</span>
            <span className={styles.offlineHint}>Relink this footage to preview it.</span>
          </div>
        ) : null}
        {import.meta.env.DEV && inShort ? (
          <span className={styles.dropped} aria-hidden="true">
            Dropped {droppedFrames}
          </span>
        ) : null}
      </div>
      {inShort ? null : <SourceViewer />}
      <div className={styles.footer}>
        <div className={styles.scrub}>
          <ScrubBar />
        </div>
        <PreviewControls
          shortView={inShort}
          zoom={zoom}
          onZoomChange={changeZoom}
          safeZones={safeZonesOn}
          onSafeZonesChange={(show) => previewSettingsStore.getState().setSafeZoneOverride(show)}
          fullscreen={fullscreen.active}
          onToggleFullscreen={fullscreen.toggle}
        />
      </div>
    </section>
  )
}
