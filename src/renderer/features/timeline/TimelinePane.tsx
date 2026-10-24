import { useEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { useStore } from 'zustand'
import { Lock, LockOpen, Maximize2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import { addTrack, placeClips, setTrackFlag, trimClip } from '@shared/timeline/edits'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import type { MediaRef } from '@shared/project/schema'
import type { Clip, Timeline, Track, TrackKind, TrackRole } from '@shared/timeline/timeline'
import { snapEdge, snapPoints, snapStart } from '@shared/timeline/snap'
import { mainGaps, type Gap } from '@shared/timeline/gaps'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { inspectorStore } from '../inspector/inspectorStore'
import { selectionTypeFor } from '../inspector/inspectorModel'
import { formatTimecode } from '../playback/playbackClock'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { clipsInRange, trimReadout, visibleLaneRange } from './clipView'
import { TimelineClip } from './TimelineClip'
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
import { closeGapEdit, timelineShortcuts, type TimelineShortcutContext } from './timelineShortcuts'
import { shortcutRegistry } from '../shortcuts/shortcutRegistry'
import styles from './TimelinePane.module.css'

export type TimelineEdit = (timeline: Timeline) => Timeline

// The footage clips refer to. Clips show thumbnails from projectFolder's cache, and offline media is
// marked. Without it, clips show their labels only.
export interface TimelineMedia {
  projectFolder: string
  items: readonly MediaRef[]
  offlineIds: readonly string[]
}

export interface TimelinePaneProps {
  timeline: Timeline
  // The short's target length. The band shows where the length should fall.
  target: { minMs: number; maxMs: number }
  // Each edit goes to the caller, which runs it as a command. A drag passes a mergeKey.
  onEdit: (label: string, edit: TimelineEdit, mergeKey?: string) => void
  newId?: () => string
  media?: TimelineMedia
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
// A press becomes a drag after this much movement, so a click never moves a clip.
const DRAG_THRESHOLD_PX = 4
// How close an edge must be to a snap point before a drag snaps to it.
const SNAP_PX = 8

// Where a drag would put the moving clips. Shown while dragging; committed on release.
interface DragPreview {
  clipIds: string[]
  targetTrackId: string
  startMs: number
}

// Where a trim would put one edge of a clip. Shown while trimming; committed on release.
interface TrimPreview {
  clipId: string
  trackId: string
  edge: 'start' | 'end'
  boundaryMs: number
  sourceLengthMs?: number
}

// The live state of one pointer drag. It lives outside React state so the window listeners always
// see the latest values, and only the preview is rendered.
interface DragSession {
  clipIds: string[]
  kind: TrackKind
  pressedId: string
  pressedWasInGroup: boolean
  startX: number
  startY: number
  baseMs: number
  spanMs: number
  targetTrackId: string
  startMs: number
  moved: boolean
}

// The selection: some clips, or one gap on the main track. Never both.
interface Selection {
  clipIds: string[]
  gap: Gap | null
}

const NO_SELECTION: Selection = { clipIds: [], gap: null }

// Timeline pane: a timecode ruler that seeks, fixed lanes with mute and lock, an Add track menu, zoom
// with Ctrl+wheel and Fit, a playhead that follows playback, and the target band.
export function TimelinePane({
  timeline,
  target,
  onEdit,
  newId,
  media
}: TimelinePaneProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pxPerMs = useStore(timelineViewStore, (state) => state.pxPerMs)
  const snapping = useStore(timelineViewStore, (state) => state.snapping)
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const playing = usePlaybackStore((state) => state.playing)
  // What the scroll area shows. Only clips in this range are rendered.
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 })
  // What is selected: clips, or one gap on the main track. Shift-click adds and removes clips; a drag
  // moves the whole clip selection. Selecting a clip clears a gap, and selecting a gap clears clips.
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const selectedIds = selection.clipIds
  const [drag, setDrag] = useState<DragPreview | null>(null)
  const [trim, setTrim] = useState<TrimPreview | null>(null)
  const newTrackId = newId ?? (() => crypto.randomUUID())
  // The latest props for the window listeners of a drag, which are attached once per press.
  const latest = useRef({ timeline, pxPerMs, snapping, onEdit, selection, newId: newTrackId })
  latest.current = { timeline, pxPerMs, snapping, onEdit, selection, newId: newTrackId }
  const releaseDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => releaseDrag.current?.(), [])

  // The timeline as it will look if the drag or trim drops now. It is committed only on release.
  const shown = trim ? previewTrimmed(timeline, trim) : previewTimeline(timeline, drag)
  const trimmedClip = trim ? findClip(shown, trim.clipId)?.clip : undefined
  const durationMs = timelineDurationMs(timeline)
  const widthPx = timelineWidthPx(durationMs, target.maxMs, pxPerMs)
  const band = targetBand(target.minMs, target.maxMs, pxPerMs)
  const ticks = rulerTicks(Math.max(durationMs, target.maxMs, 60_000), pxPerMs)
  const extraTracks = shown.tracks.filter((track) => !FIXED_ROLES.has(track.role))
  const gaps = mainGaps(shown)
  const playheadX = timeToX(playheadMs, pxPerMs)
  const laneRange = visibleLaneRange(viewport.scrollLeft, viewport.width, HEADER_PX)
  const offlineIds = new Set(media?.offlineIds ?? [])
  const allClips = shown.tracks.flatMap((track) => track.clips)

  // Playback length follows the timeline, so the scrub bar and the playhead stop at its end.
  useEffect(() => {
    playbackStore.getState().setDurationMs(durationMs)
  }, [durationMs])

  // Tracks the viewport width, so clips scrolled into a wider window are rendered.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined
    const measure = () =>
      setViewport((current) =>
        current.width === element.clientWidth && current.scrollLeft === element.scrollLeft
          ? current
          : { scrollLeft: element.scrollLeft, width: element.clientWidth }
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

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

  function selectClips(update: (ids: string[]) => string[]) {
    setSelection((current) => ({ clipIds: update(current.clipIds), gap: null }))
  }

  function selectGap(gap: Gap) {
    setSelection({ clipIds: [], gap })
  }

  // Runs an edit as one history entry, unless it changes nothing or is refused. Returns whether it ran.
  function runEdit(label: string, edit: TimelineEdit): boolean {
    const current = latest.current.timeline
    let next: Timeline
    try {
      next = edit(current)
    } catch {
      return false
    }
    if (next === current) return false
    latest.current.onEdit(label, edit)
    return true
  }

  // The inspector edits what this pane selects. Publish the selection type; the short itself when nothing
  // is selected. Reset on unmount so a closed timeline does not leave a stale selection behind.
  useEffect(() => {
    inspectorStore
      .getState()
      .setSelectionType(selectionTypeFor(timeline, selectedIds, selection.gap))
  }, [timeline, selectedIds, selection.gap])
  useEffect(() => () => inspectorStore.getState().setSelectionType('short'), [])

  // The shortcuts read the pane through this, so they always see the latest timeline and selection.
  const readShortcutContext = (): TimelineShortcutContext => ({
    timeline: latest.current.timeline,
    selectedIds: latest.current.selection.clipIds,
    gap: latest.current.selection.gap,
    playheadMs: playbackStore.getState().playheadMs,
    newId: latest.current.newId,
    edit: runEdit,
    clearSelection: () => setSelection(NO_SELECTION)
  })

  // Split, Delete and gap shortcuts are live while the pane is mounted.
  useEffect(() => {
    const removers = timelineShortcuts(readShortcutContext).map((shortcut) =>
      shortcutRegistry.register(shortcut)
    )
    return () => removers.forEach((remove) => remove())
    // The context reads only refs and stable setters, so the shortcuts register once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A press on a clip selects it, or starts a drag of the selection. Shift adds or removes it.
  function pressClip(event: PointerEvent<HTMLDivElement>, clip: Clip, track: Track) {
    if (event.button !== 0) return
    if (event.shiftKey) {
      selectClips((ids) =>
        ids.includes(clip.id) ? ids.filter((id) => id !== clip.id) : [...ids, clip.id]
      )
      return
    }
    const inGroup = selectedIds.includes(clip.id)
    if (!inGroup) selectClips(() => [clip.id])
    if (track.locked) return

    // Only clips that move with this one: the same kind, on unlocked tracks.
    const movingClips = (inGroup ? selectedIds : [clip.id]).flatMap((id) => {
      const found = findClip(latest.current.timeline, id)
      return found && !found.track.locked && found.track.kind === track.kind ? [found.clip] : []
    })
    const baseMs = Math.min(...movingClips.map((item) => item.startMs))
    const spanMs = Math.max(...movingClips.map((item) => item.startMs + item.durationMs)) - baseMs

    const session: DragSession = {
      clipIds: movingClips.map((item) => item.id),
      kind: track.kind,
      pressedId: clip.id,
      pressedWasInGroup: inGroup && selectedIds.length > 1,
      startX: event.clientX,
      startY: event.clientY,
      baseMs,
      spanMs,
      targetTrackId: track.id,
      startMs: baseMs,
      moved: false
    }

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - session.startX
      const dy = move.clientY - session.startY
      if (!session.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      session.moved = true
      const { timeline: current, pxPerMs: scale, snapping: snap } = latest.current

      let startMs = Math.max(0, session.baseMs + dx / scale)
      if (snap && !move.altKey) {
        const points = snapPoints(current, session.clipIds, playbackStore.getState().playheadMs)
        startMs = snapStart(startMs, session.spanMs, points, SNAP_PX / scale).startMs
      }

      // The lane under the pointer, when it can take these clips. Otherwise the last valid lane stays.
      const lane = document
        .elementFromPoint(move.clientX, move.clientY)
        ?.closest<HTMLElement>('[data-track-id]')
      const hovered = lane?.dataset.trackId
        ? current.tracks.find((item) => item.id === lane.dataset.trackId)
        : undefined
      if (hovered && !hovered.locked && hovered.kind === session.kind) {
        session.targetTrackId = hovered.id
      }

      session.startMs = startMs
      setDrag({ clipIds: session.clipIds, targetTrackId: session.targetTrackId, startMs })
    }

    const release = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      releaseDrag.current = null
    }

    const onEnd = () => {
      release()
      setDrag(null)
      if (!session.moved) {
        // A click on one clip of a multi-selection selects that clip alone.
        if (session.pressedWasInGroup) selectClips(() => [session.pressedId])
        return
      }
      const { clipIds, targetTrackId, startMs } = session
      const edit = (current: Timeline) => placeClips(current, clipIds, targetTrackId, startMs)
      try {
        edit(latest.current.timeline)
      } catch {
        // An invalid drop is not applied.
        return
      }
      latest.current.onEdit(clipIds.length === 1 ? 'Move clip' : 'Move clips', edit)
    }

    releaseDrag.current?.()
    releaseDrag.current = release
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  // A press on a trim handle drags one edge of the clip. The clip is trimmed on release, as one edit.
  // While trimming, the preview seeks to the dragged edge and the playhead returns on release.
  function pressTrim(
    event: PointerEvent<HTMLDivElement>,
    clip: Clip,
    track: Track,
    edge: 'start' | 'end'
  ) {
    if (event.button !== 0 || track.locked) return
    event.stopPropagation()
    selectClips(() => [clip.id])

    const startX = event.clientX
    const originMs = edge === 'start' ? clip.startMs : clip.startMs + clip.durationMs
    const sourceLengthMs = media?.items.find((ref) => ref.id === clip.mediaId)?.durationMs
    const playheadAtPress = playbackStore.getState().playheadMs
    let moved = false
    let last: TrimPreview | null = null

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
      moved = true
      const { timeline: current, pxPerMs: scale, snapping: snap } = latest.current

      let boundaryMs = Math.max(0, originMs + dx / scale)
      if (snap && !move.altKey) {
        const points = snapPoints(current, [clip.id], playheadAtPress)
        boundaryMs = snapEdge(boundaryMs, points, SNAP_PX / scale)
      }

      last = { clipId: clip.id, trackId: track.id, edge, boundaryMs, sourceLengthMs }
      setTrim(last)
      const trimmed = findClip(previewTrimmed(current, last), clip.id)?.clip
      if (trimmed) {
        const frameMs =
          edge === 'start' ? trimmed.startMs : trimmed.startMs + trimmed.durationMs - 1
        playbackStore.getState().seek(frameMs)
      }
    }

    const release = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      releaseDrag.current = null
      setTrim(null)
      playbackStore.getState().seek(playheadAtPress)
    }

    const onEnd = () => {
      const finished = last
      const didMove = moved
      release()
      if (!finished || !didMove) return
      const edit = (current: Timeline) =>
        trimClip(
          current,
          finished.clipId,
          finished.edge,
          finished.boundaryMs,
          finished.sourceLengthMs
        )
      try {
        edit(latest.current.timeline)
      } catch {
        // An invalid trim is not applied.
        return
      }
      latest.current.onEdit('Trim clip', edit)
    }

    releaseDrag.current?.()
    releaseDrag.current = release
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  // The readout beside a trimmed edge: the clip's new length and the source timecode at that edge.
  function trimTooltip(clip: Clip, edge: 'start' | 'end') {
    const readout = trimReadout(clip, edge)
    const edgeMs = edge === 'start' ? clip.startMs : clip.startMs + clip.durationMs
    return (
      <div className={styles.trimTip} style={{ left: timeToX(edgeMs, pxPerMs) }} role="status">
        {`${formatTimecode(readout.durationMs)} long, source ${formatTimecode(readout.sourceMs)}`}
      </div>
    )
  }

  // The clips of one lane that are on screen. Each is positioned in the lane body.
  function laneClips(track: Track) {
    return clipsInRange(track.clips, pxPerMs, laneRange).map((clip) => {
      const linkedClip = clip.linkedAudio
        ? allClips.find((item) => item.id === clip.linkedAudio)
        : undefined
      const linkedMedia = linkedClip?.mediaId
        ? media?.items.find((ref) => ref.id === linkedClip.mediaId)
        : undefined
      const mediaRef = clip.mediaId
        ? media?.items.find((ref) => ref.id === clip.mediaId)
        : undefined
      return (
        <TimelineClip
          key={clip.id}
          clip={clip}
          kind={track.kind}
          locked={track.locked ?? false}
          selected={selectedIds.includes(clip.id)}
          pxPerMs={pxPerMs}
          range={laneRange}
          media={mediaRef}
          offline={clip.mediaId !== undefined && offlineIds.has(clip.mediaId)}
          projectFolder={media?.projectFolder}
          linked={
            linkedClip
              ? {
                  clip: linkedClip,
                  media: linkedMedia,
                  offline: linkedClip.mediaId !== undefined && offlineIds.has(linkedClip.mediaId)
                }
              : undefined
          }
          onPointerDown={(event) => pressClip(event, clip, track)}
          onTrimPointerDown={
            track.locked ? undefined : (edge, event) => pressTrim(event, clip, track, edge)
          }
          onSelect={() => selectClips(() => [clip.id])}
        />
      )
    })
  }

  // The gaps on one main track. A gap is selected by a press; a selected gap offers Close gap.
  function gapElements(trackId: string) {
    return gaps
      .filter((gap) => gap.trackId === trackId)
      .map((gap) => {
        const selected =
          selection.gap?.trackId === gap.trackId && selection.gap.startMs === gap.startMs
        const widthPx = timeToX(gap.endMs - gap.startMs, pxPerMs)
        return (
          <div
            key={`gap-${gap.startMs}`}
            className={selected ? `${styles.gap} ${styles.gapSelected}` : styles.gap}
            style={{ left: timeToX(gap.startMs, pxPerMs), width: widthPx }}
            role="button"
            aria-label={`Gap of ${formatTimecode(gap.endMs - gap.startMs)} at ${formatTimecode(gap.startMs)}`}
            aria-pressed={selected}
            onPointerDown={(event) => {
              if (event.button === 0) selectGap(gap)
            }}
          >
            {selected ? (
              <div className={styles.gapMenu}>
                <DropdownMenu
                  trigger={<Button variant="ghost">Gap</Button>}
                  items={[
                    {
                      label: 'Close gap',
                      onSelect: () => {
                        if (runEdit('Close gap', closeGapEdit(gap))) {
                          setSelection(NO_SELECTION)
                        }
                      }
                    }
                  ]}
                />
              </div>
            ) : null}
          </div>
        )
      })
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
        <div
          className={styles.laneBody}
          style={{ width: widthPx }}
          data-role={role}
          data-track-id={track?.id}
        >
          {track ? laneClips(track) : null}
          {track?.role === 'main' ? gapElements(track.id) : null}
          {track && trim && trimmedClip && trim.trackId === track.id
            ? trimTooltip(trimmedClip, trim.edge)
            : null}
        </div>
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
        <Button
          variant="ghost"
          aria-pressed={snapping}
          onClick={() => timelineViewStore.getState().toggleSnapping()}
        >
          Snap
        </Button>
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

      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={(event) =>
          setViewport({
            scrollLeft: event.currentTarget.scrollLeft,
            width: event.currentTarget.clientWidth
          })
        }
      >
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
              shown.tracks.find((track) => track.role === lane.role),
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
            {drag ? (
              <div className={styles.dropLine} style={{ left: timeToX(drag.startMs, pxPerMs) }} />
            ) : null}
            <div className={styles.playhead} style={{ left: playheadX }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// The clip with a trim applied. A trim that would be invalid shows the timeline as it was.
function previewTrimmed(timeline: Timeline, trim: TrimPreview | null): Timeline {
  if (!trim) return timeline
  try {
    return trimClip(timeline, trim.clipId, trim.edge, trim.boundaryMs, trim.sourceLengthMs)
  } catch {
    return timeline
  }
}

function findClip(timeline: Timeline, clipId: string): { track: Track; clip: Clip } | undefined {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { track, clip }
  }
  return undefined
}

// The timeline with a drag applied. A drop that would be invalid shows the timeline as it was.
function previewTimeline(timeline: Timeline, drag: DragPreview | null): Timeline {
  if (!drag) return timeline
  try {
    return placeClips(timeline, drag.clipIds, drag.targetTrackId, drag.startMs)
  } catch {
    return timeline
  }
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
