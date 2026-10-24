import { useEffect, useRef, type JSX, type PointerEvent } from 'react'
import { useStore } from 'zustand'
import { Lock, LockOpen, Maximize2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import { addTrack, setTrackFlag } from '@shared/timeline/edits'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { Timeline, Track, TrackKind, TrackRole } from '@shared/timeline/timeline'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { formatTimecode } from '../playback/playbackClock'
import { playbackStore } from '../playback/playbackStore'
import { sourceStore } from '../source/sourceStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import {
  fitPxPerMs,
  followPlayhead,
  rulerTicks,
  targetBand,
  timelineWidthPx,
  timeToX,
  xToTime
} from './timelineView'
import { timelineViewStore } from './timelineViewStore'
import styles from './TimelinePane.module.css'

export type TimelineEdit = (timeline: Timeline) => Timeline

export interface TimelinePaneProps {
  timeline: Timeline
  // The short's target length. The band shows where the length should fall.
  target: { minMs: number; maxMs: number }
  // Each edit goes to the caller, which runs it as a command. A drag passes a mergeKey.
  onEdit: (label: string, edit: TimelineEdit, mergeKey?: string) => void
  newId?: () => string
}

// The fixed lanes, top to bottom. Each lane is one track role; a lane with no track offers Add.
const FIXED_LANES: { role: TrackRole; label: string; kind: TrackKind }[] = [
  { role: 'main', label: 'Main', kind: 'video' },
  { role: 'narration', label: 'Narration', kind: 'audio' },
  { role: 'music', label: 'Music', kind: 'audio' },
  { role: 'captions', label: 'Captions', kind: 'text' }
]
const FIXED_ROLES = new Set<TrackRole>(FIXED_LANES.map((lane) => lane.role))

const ADD_TRACK_OPTIONS: { label: string; kind: TrackKind; role: TrackRole }[] = [
  { label: 'Overlay video', kind: 'video', role: 'overlay' },
  { label: 'Text', kind: 'text', role: 'text' },
  { label: 'Overlay', kind: 'overlay', role: 'overlay' }
]

// Layout, in pixels. The lane header column stays put while the timeline scrolls.
const HEADER_PX = 150
const RULER_HEIGHT_PX = 28
const LANE_HEIGHT_PX = 44

// Timeline pane: a timecode ruler that seeks, fixed lanes with mute and lock, an Add track menu, zoom
// with Ctrl+wheel and Fit, a playhead that follows playback, and the target band.
export function TimelinePane({ timeline, target, onEdit, newId }: TimelinePaneProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pxPerMs = useStore(timelineViewStore, (state) => state.pxPerMs)
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const playing = usePlaybackStore((state) => state.playing)

  const durationMs = timelineDurationMs(timeline)
  const widthPx = timelineWidthPx(durationMs, target.maxMs, pxPerMs)
  const band = targetBand(target.minMs, target.maxMs, pxPerMs)
  const ticks = rulerTicks(Math.max(durationMs, target.maxMs, 60_000), pxPerMs)
  const extraTracks = timeline.tracks.filter((track) => !FIXED_ROLES.has(track.role))
  const newTrackId = newId ?? (() => crypto.randomUUID())
  const playheadX = timeToX(playheadMs, pxPerMs)

  // In Short view the playback length follows the timeline, so the scrub bar and the playhead stop
  // at its end. In Source view the clip sets the length instead.
  const viewMode = useStore(sourceStore, (state) => state.mode)
  useEffect(() => {
    if (viewMode === 'short') playbackStore.getState().setDurationMs(durationMs)
  }, [durationMs, viewMode])

  // Ctrl+wheel zooms. It is a native listener so the page does not scroll with it.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      if (event.deltaY < 0) timelineViewStore.getState().zoomIn()
      else timelineViewStore.getState().zoomOut()
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  // While playing, scroll so the playhead stays in view.
  useEffect(() => {
    const element = scrollRef.current
    if (!playing || !element) return
    element.scrollLeft = followPlayhead(element.scrollLeft, playheadX, element.clientWidth)
  }, [playheadX, playing])

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    const ruler = rulerRef.current
    if (!ruler) return
    const x = event.clientX - ruler.getBoundingClientRect().left
    playbackStore.getState().seek(xToTime(x, pxPerMs))
  }

  function handleRulerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    seekFromPointer(event)
  }

  function handleRulerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) seekFromPointer(event)
  }

  function stopDrag() {
    dragging.current = false
  }

  function fit() {
    const width = scrollRef.current?.clientWidth ?? 0
    timelineViewStore.getState().setPxPerMs(fitPxPerMs(Math.max(durationMs, target.maxMs), width))
  }

  function addLaneTrack(track: Track) {
    onEdit('Add track', (current) => addTrack(current, track))
  }

  function laneRow(track: Track | undefined, label: string, kind: TrackKind, role: TrackRole) {
    return (
      <div
        key={`${role}-${track?.id ?? 'none'}`}
        className={styles.lane}
        style={{ height: LANE_HEIGHT_PX }}
      >
        <div className={styles.header} style={{ width: HEADER_PX }}>
          <span className={styles.name}>{label}</span>
          {track ? (
            <>
              <IconButton
                icon={track.muted ? VolumeX : Volume2}
                label={track.muted ? `Unmute ${label}` : `Mute ${label}`}
                onClick={() =>
                  onEdit(track.muted ? 'Unmute track' : 'Mute track', (current) =>
                    setTrackFlag(current, track.id, 'muted', !track.muted)
                  )
                }
              />
              <IconButton
                icon={track.locked ? Lock : LockOpen}
                label={track.locked ? `Unlock ${label}` : `Lock ${label}`}
                onClick={() =>
                  onEdit(track.locked ? 'Unlock track' : 'Lock track', (current) =>
                    setTrackFlag(current, track.id, 'locked', !track.locked)
                  )
                }
              />
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={() =>
                addLaneTrack({ id: newTrackId(), kind, role, muted: false, clips: [] })
              }
            >
              Add
            </Button>
          )}
        </div>
        <div className={styles.laneBody} style={{ width: widthPx }} data-role={role} />
      </div>
    )
  }

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <DropdownMenu
          trigger={<Button variant="secondary">Add track</Button>}
          items={ADD_TRACK_OPTIONS.map((option) => ({
            label: option.label,
            onSelect: () =>
              addLaneTrack({
                id: newTrackId(),
                kind: option.kind,
                role: option.role,
                muted: false,
                clips: []
              })
          }))}
        />
        <div className={styles.zoom}>
          <IconButton
            icon={ZoomOut}
            label="Zoom out"
            onClick={() => timelineViewStore.getState().zoomOut()}
          />
          <IconButton
            icon={ZoomIn}
            label="Zoom in"
            onClick={() => timelineViewStore.getState().zoomIn()}
          />
          <IconButton icon={Maximize2} label="Fit timeline" onClick={fit} />
        </div>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.canvas} style={{ width: HEADER_PX + widthPx }}>
          <div className={styles.rulerRow} style={{ height: RULER_HEIGHT_PX }}>
            <div className={styles.headerSpacer} style={{ width: HEADER_PX }} />
            <div
              ref={rulerRef}
              className={styles.ruler}
              style={{ width: widthPx }}
              onPointerDown={handleRulerDown}
              onPointerMove={handleRulerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              role="slider"
              aria-label="Timeline ruler"
              aria-valuenow={Math.round(playheadMs)}
              aria-valuemin={0}
              aria-valuemax={Math.round(durationMs)}
              tabIndex={0}
            >
              {ticks.map((ms) => (
                <span key={ms} className={styles.tick} style={{ left: timeToX(ms, pxPerMs) }}>
                  {formatTimecode(ms)}
                </span>
              ))}
            </div>
          </div>

          {FIXED_LANES.map((lane) =>
            laneRow(
              timeline.tracks.find((track) => track.role === lane.role),
              lane.label,
              lane.kind,
              lane.role
            )
          )}
          {extraTracks.map((track) => laneRow(track, extraLabel(track), track.kind, track.role))}

          {/* Overlays the lanes' bodies. Positioned from the left of the body, not the header. */}
          <div
            className={styles.overlay}
            style={{ left: HEADER_PX, top: RULER_HEIGHT_PX, width: widthPx }}
            aria-hidden="true"
          >
            <div className={styles.targetBand} style={{ left: band.leftPx, width: band.widthPx }} />
            <div
              className={styles.overTarget}
              style={{ left: band.overMaxPx, width: Math.max(widthPx - band.overMaxPx, 0) }}
            />
            <div className={styles.playhead} style={{ left: playheadX }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function extraLabel(track: Track): string {
  const names: Record<TrackKind, string> = {
    video: 'Overlay video',
    audio: 'Audio',
    text: 'Text',
    overlay: 'Overlay'
  }
  return names[track.kind]
}
