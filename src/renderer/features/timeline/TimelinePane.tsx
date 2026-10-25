import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type PointerEvent
} from 'react'
import { useStore } from 'zustand'
import { Lock, LockOpen, Maximize2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import {
  addTrack,
  insertClip,
  loopFillClip,
  placeClips,
  removeTransition,
  resizeCutTransition,
  setClipAudio,
  setTransitionKind,
  setDucking,
  setTrackFlag,
  trimClip,
  updateClipFraming,
  updateClipImageItem,
  updateClipTextItem
} from '@shared/timeline/edits'
import { textOverlayOf } from '@shared/text/textClip'
import { imageOverlayOf } from '@shared/image/imageOverlay'
import { CENTRED_FILL } from '@shared/timeline/framing'
import {
  TRANSITION_LABELS,
  kindOf,
  transitionById,
  transitionLimitFor,
  transitionWindow
} from '@shared/timeline/transitions'
import { audioClipForDrop } from '@shared/timeline/audioDrop'
import { footageClipForDrop, footageInsertMs } from '@shared/timeline/footageDrop'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import { duckEnvelope, duckingFor, narrationRanges } from '@shared/timeline/ducking'
import type { MediaRef, Moment } from '@shared/project/schema'
import type { Clip, Timeline, Track, TrackKind, TrackRole } from '@shared/timeline/timeline'
import { snapEdge, snapPoints, snapStart } from '@shared/timeline/snap'
import { mainGaps, type Gap } from '@shared/timeline/gaps'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { soundClipFor, soundsFor } from '../audio/clipSound'
import { soundValuesOf } from '../audio/soundValues'
import { sharedProperties } from '../inspector/sharedProperties'
import { videoSelectionFor } from '../clip/videoClipFields'
import { carriesFootage, decodeDragPayload, DRAG_MIME } from '@shared/timeline/dragPayload'
import { layerSelectionStore } from '../compositor/layerSelectionStore'
import { framingClipFor } from '../compositor/panTarget'
import { inspectorStore } from '../inspector/inspectorStore'
import { selectionTypeFor } from '../inspector/inspectorModel'
import { formatTimecode } from '../playback/playbackClock'
import { toast } from '../toasts/toast'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { setEditorPlaybackDuration, sourceStore } from '../source/sourceStore'
import {
  clipsInRange,
  fadeMsFromPointer,
  gainLinePoints,
  trimReadout,
  visibleLaneRange
} from './clipView'
import { CLIP_HEIGHT_PX, TimelineClip } from './TimelineClip'
import { ClipContextMenu } from './ClipContextMenu'
import { clipMenuItems } from './clipMenuItems'
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
import { SetPosterButton } from '../shorts/SetPosterButton'
import { CaptionBlocks } from '../captions/CaptionBlocks'
import { closeGapEdit, timelineShortcuts, type TimelineShortcutContext } from './timelineShortcuts'
import { shortcutRegistry } from '../shortcuts/shortcutRegistry'
import { RecordNarrationButton } from '../narration/RecordNarrationButton'
import { narrationClipFor } from '../narration/narrationClipEdits'
import styles from './TimelinePane.module.css'

export type TimelineEdit = (timeline: Timeline) => Timeline

// The footage clips refer to. Clips show thumbnails from projectFolder's cache, and offline media is
// marked. Without it, clips show their labels only.
export interface TimelineMedia {
  projectFolder: string
  items: readonly MediaRef[]
  offlineIds: readonly string[]
  // The project's moments. A clip from a moment shows the moment's name.
  moments?: readonly Moment[]
}

export interface TimelinePaneProps {
  timeline: Timeline
  // The short's target length. The band shows where the length should fall.
  target: { minMs: number; maxMs: number }
  // Each edit goes to the caller, which runs it as a command. A drag passes a mergeKey.
  onEdit: (label: string, edit: TimelineEdit, mergeKey?: string) => void
  newId?: () => string
  // The short the pane edits. When set, the Narration lane offers Record narration.
  shortId?: string
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

// Main and the overlay lanes are video tracks, so they take footage drops.
function isVideoRole(role: TrackRole): boolean {
  return role === 'main' || role === 'overlay'
}

// The Music and Narration lanes are audio lanes: they take audio footage drops.
function isAudioLane(role: TrackRole): boolean {
  return role === 'music' || role === 'narration'
}

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

// Where a fade handle drag would set one fade of an audio clip. Shown while dragging; committed on release.
interface FadePreview {
  clipId: string
  edge: 'in' | 'out'
  ms: number
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

// The selection: some clips, one gap on the main track, or one transition. Never more than one kind.
interface Selection {
  clipIds: string[]
  gap: Gap | null
  transitionId: string | null
}

const NO_SELECTION: Selection = { clipIds: [], gap: null, transitionId: null }

// Timeline pane: a timecode ruler that seeks, fixed lanes with mute and lock, an Add track menu, zoom
// with Ctrl+wheel and Fit, a playhead that follows playback, and the target band.
export function TimelinePane({
  timeline,
  target,
  onEdit,
  newId,
  shortId,
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
  // Where footage dragged over a video lane would land: the lane and the time of the insert point.
  // It drives the insertion line and is cleared when the drag leaves the lane or drops.
  const [footageDrop, setFootageDrop] = useState<{ trackId: string; startMs: number } | null>(null)
  const [trim, setTrim] = useState<TrimPreview | null>(null)
  const [fadeDrag, setFadeDrag] = useState<FadePreview | null>(null)
  // The clip whose menu is open, and the point it opened at (see openClipMenu).
  const [clipMenu, setClipMenu] = useState<{ clipId: string; x: number; y: number } | null>(null)
  const newTrackId = newId ?? (() => crypto.randomUUID())
  // The latest props for the window listeners of a drag, which are attached once per press.
  const latest = useRef({ timeline, pxPerMs, snapping, onEdit, selection, newId: newTrackId })
  latest.current = { timeline, pxPerMs, snapping, onEdit, selection, newId: newTrackId }
  const releaseDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => releaseDrag.current?.(), [])
  // The canvas gizmo shares this selection. A layer picked on the canvas selects its clip here, and a
  // single clip selected here shows on the canvas.
  const canvasSelection = useStore(layerSelectionStore, (state) => state.selectedClipId)
  useEffect(() => {
    if (canvasSelection !== null) {
      setSelection({ clipIds: [canvasSelection], gap: null, transitionId: null })
    }
  }, [canvasSelection])
  useEffect(() => {
    if (selectedIds.length === 1) layerSelectionStore.getState().select(selectedIds[0])
  }, [selectedIds])

  // The timeline as it will look if the drag or trim drops now. It is committed only on release.
  const shown = previewFaded(
    trim ? previewTrimmed(timeline, trim) : previewTimeline(timeline, drag),
    fadeDrag
  )
  const trimmedClip = trim ? findClip(shown, trim.clipId)?.clip : undefined
  const duckPoints = duckEnvelope(narrationRanges(shown), duckingFor(shown))
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

  // Playback length follows the timeline in Short view, so the scrub bar and the playhead stop at its
  // end. Source view keeps its own length (see setEditorPlaybackDuration).
  const sourceMode = useStore(sourceStore, (state) => state.mode)
  useEffect(() => {
    setEditorPlaybackDuration(durationMs)
  }, [durationMs, sourceMode])

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

  // The Music and Narration lanes take audio footage dropped from the media panel.
  function onAudioLaneDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesFootage(event.dataTransfer.types)) return
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onAudioLaneDrop(event: DragEvent<HTMLDivElement>, track: Track) {
    if (!carriesFootage(event.dataTransfer.types)) return
    event.stopPropagation()
    event.preventDefault()
    const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_MIME))
    if (payload === null) return
    const lane = track.role === 'narration' ? 'narration' : 'music'
    const laneName = lane === 'narration' ? 'Narration' : 'Music'
    if (track.locked) {
      toast.info({ title: `${laneName} lane is locked`, description: 'Unlock it to add a clip.' })
      return
    }
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const result = audioClipForDrop(
      payload,
      media?.items ?? [],
      newTrackId(),
      xToTime(x, pxPerMs),
      lane
    )
    if (!result.ok) {
      toast.info({ title: `Cannot add to ${laneName}`, description: result.reason })
      return
    }
    const clip = result.clip
    onEdit(`Add ${lane} clip`, (current) => insertClip(current, track.id, clip, clip.startMs))
  }

  // A video lane (Main or an overlay) takes video footage from the media panel or the source viewer.
  // While dragging, the insert point shows; on drop the clip is added as one edit.
  function onVideoDragOver(event: DragEvent<HTMLDivElement>, track: Track) {
    if (!carriesFootage(event.dataTransfer.types)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const startMs = footageInsertMs(track, xToTime(x, pxPerMs))
    setFootageDrop((current) =>
      current?.trackId === track.id && current.startMs === startMs
        ? current
        : { trackId: track.id, startMs }
    )
  }

  function onVideoDragLeave(event: DragEvent<HTMLDivElement>, track: Track) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setFootageDrop((current) => (current?.trackId === track.id ? null : current))
  }

  function onVideoDrop(event: DragEvent<HTMLDivElement>, track: Track) {
    if (!carriesFootage(event.dataTransfer.types)) return
    event.preventDefault()
    setFootageDrop(null)
    const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_MIME))
    if (payload === null) return
    if (track.locked) {
      toast.info({ title: 'Track is locked', description: 'Unlock it to add a clip.' })
      return
    }
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left
    const result = footageClipForDrop(
      payload,
      media?.items ?? [],
      track,
      newTrackId(),
      xToTime(x, pxPerMs)
    )
    if (!result.ok) {
      toast.info({ title: 'Cannot add this clip', description: result.reason })
      return
    }
    const clip = result.clip
    onEdit(clip.momentId ? 'Add moment clip' : 'Add clip', (current) =>
      insertClip(current, track.id, clip, clip.startMs)
    )
  }

  // Loop to fill repeats the one selected music clip to the short's length, as one history entry.
  function loopSelectedClip() {
    const clipId = selectedIds[0]
    if (clipId === undefined) return
    const untilMs = timelineDurationMs(timeline)
    const done = runEdit('Loop to fill', (current) =>
      loopFillClip(current, clipId, untilMs, newTrackId)
    )
    if (!done) {
      toast.info({
        title: 'Cannot loop this clip',
        description: 'It already reaches the end of the short, or it is too short to repeat.'
      })
    }
  }

  function selectClips(update: (ids: string[]) => string[]) {
    setSelection((current) => ({ clipIds: update(current.clipIds), gap: null, transitionId: null }))
  }

  function selectGap(gap: Gap) {
    setSelection({ clipIds: [], gap, transitionId: null })
  }

  function selectTransition(transitionId: string) {
    setSelection({ clipIds: [], gap: null, transitionId })
  }

  // Runs an edit as one history entry, unless it changes nothing or is refused. Returns whether it ran.
  // It is stable (it reads only the ref), so effects can list it as a dependency.
  const runEdit = useCallback((label: string, edit: TimelineEdit, mergeKey?: string): boolean => {
    const current = latest.current.timeline
    let next: Timeline
    try {
      next = edit(current)
    } catch {
      return false
    }
    if (next === current) return false
    latest.current.onEdit(label, edit, mergeKey)
    return true
  }, [])

  // The inspector edits what this pane selects. Publish the selection type; the short itself when nothing
  // is selected. Reset on unmount so a closed timeline does not leave a stale selection behind.
  useEffect(() => {
    const type = selectionTypeFor(timeline, selectedIds, selection.gap, selection.transitionId)
    // The header counts clips; a gap or a transition is one item, and the short has no selection.
    const count =
      type === 'short' ? 0 : selection.gap || selection.transitionId ? 1 : selectedIds.length
    inspectorStore.getState().setSelectionType(type, count)
  }, [timeline, selectedIds, selection.gap, selection.transitionId])
  useEffect(() => () => inspectorStore.getState().setSelectionType('short', 0), [])

  // The sound fields edit the sound of every selected clip together. They show only when every selected
  // item has a sound, and each edit lands on all of the sounds as one history entry (#99).
  useEffect(() => {
    const sounds = soundsFor(timeline, selectedIds)
    const shared = sharedProperties(sounds.map((sound) => (sound ? soundValuesOf(sound) : null)))
    const soundIds = sounds.flatMap((sound) => (sound ? [sound.id] : []))
    inspectorStore.getState().setAudioTarget(
      shared && soundIds.length > 0
        ? {
            soundIds,
            shared,
            apply: (label, change, mergeKey) =>
              runEdit(
                label,
                (current) => soundIds.reduce((next, id) => setClipAudio(next, id, change), current),
                mergeKey
              )
          }
        : null
    )
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setAudioTarget(null), [])

  // The music section edits the selected clip when it sits on the Music lane. Ducking and loop to fill
  // are edits here, so they are undoable like the rest.
  useEffect(() => {
    const sound = soundClipFor(timeline, selectedIds)
    const onMusic = sound
      ? timeline.tracks.some(
          (track) => track.role === 'music' && track.clips.some((clip) => clip.id === sound.id)
        )
      : false
    if (!sound || !onMusic) {
      inspectorStore.getState().setMusicTarget(null)
      return
    }
    const clipId = sound.id
    const shortEnd = timelineDurationMs(timeline)
    inspectorStore.getState().setMusicTarget({
      ducking: duckingFor(timeline),
      canLoop: sound.startMs + sound.durationMs < shortEnd,
      applyDucking: (label, change, mergeKey) =>
        runEdit(label, (current) => setDucking(current, change), mergeKey),
      loopToFill: () => {
        const done = runEdit('Loop to fill', (current) =>
          loopFillClip(current, clipId, timelineDurationMs(current), latest.current.newId)
        )
        if (!done) {
          toast.info({
            title: 'Cannot loop this clip',
            description: 'It already reaches the end of the short, or it is too short to repeat.'
          })
        }
      }
    })
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setMusicTarget(null), [])
  // The video clip section edits the one selected video clip and its linked audio. Publish it, or nothing.
  useEffect(() => {
    const selected = videoSelectionFor(timeline, selectedIds)
    inspectorStore.getState().setVideoTarget(
      selected
        ? {
            clip: selected.clip,
            apply: (label, edit, mergeKey) => {
              runEdit(label, edit, mergeKey)
            }
          }
        : null
    )
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setVideoTarget(null), [])

  // The framing section edits the framing of the one selected video clip. Publish that clip, or nothing.
  useEffect(() => {
    const framed = framingClipFor(timeline, selectedIds)
    inspectorStore.getState().setFramingTarget(
      framed
        ? {
            clipId: framed.id,
            framing: framed.framing ?? { ...CENTRED_FILL },
            apply: (label, edit, mergeKey) =>
              runEdit(label, (current) => updateClipFraming(current, framed.id, edit), mergeKey)
          }
        : null
    )
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setFramingTarget(null), [])

  // The text section edits the one selected text overlay: its words, look, position and size. Each change is
  // one history entry. Publish it, or nothing.
  useEffect(() => {
    const overlay = selectedIds.length === 1 ? textOverlayOf(timeline, selectedIds[0]) : null
    if (!overlay) {
      inspectorStore.getState().setTextTarget(null)
      return
    }
    const clipId = overlay.clip.id
    inspectorStore.getState().setTextTarget({
      clip: overlay.clip,
      item: overlay.clip.textItem,
      apply: (label, edit, mergeKey) =>
        runEdit(label, (current) => updateClipTextItem(current, clipId, edit), mergeKey)
    })
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setTextTarget(null), [])

  // The image section edits the one selected image overlay: its opacity and motion. Each change is one history
  // entry. Publish it, or nothing.
  useEffect(() => {
    const overlay = selectedIds.length === 1 ? imageOverlayOf(timeline, selectedIds[0]) : null
    if (!overlay) {
      inspectorStore.getState().setImageTarget(null)
      return
    }
    const clipId = overlay.clip.id
    inspectorStore.getState().setImageTarget({
      clip: overlay.clip,
      item: overlay.clip.imageItem,
      apply: (label, edit, mergeKey) =>
        runEdit(label, (current) => updateClipImageItem(current, clipId, edit), mergeKey)
    })
  }, [timeline, selectedIds, runEdit])
  useEffect(() => () => inspectorStore.getState().setImageTarget(null), [])

  // The narration section edits the one selected narration clip: its script line, voice and text. Each change
  // is one history entry. Publish it, or nothing. Regenerating the audio is a project command, run from the
  // section with the short id.
  useEffect(() => {
    const clip = selectedIds.length === 1 ? narrationClipFor(timeline, selectedIds[0]) : null
    if (!clip || !shortId) {
      inspectorStore.getState().setNarrationTarget(null)
      return
    }
    inspectorStore.getState().setNarrationTarget({
      shortId,
      clip,
      apply: (label, edit, mergeKey) => {
        runEdit(label, edit, mergeKey)
      }
    })
  }, [timeline, selectedIds, runEdit, shortId])
  useEffect(() => () => inspectorStore.getState().setNarrationTarget(null), [])

  // The transition section edits the one selected transition: its kind, its length (clamped to the
  // handles on its cut) and removal. Each is one history entry. Publish it, or nothing.
  useEffect(() => {
    const transition = selection.transitionId
      ? transitionById(timeline, selection.transitionId)
      : undefined
    if (!transition) {
      inspectorStore.getState().setTransitionTarget(null)
      return
    }
    const sourceLengthOf = (clip: Clip): number | undefined =>
      media?.items.find((ref) => ref.id === clip.mediaId)?.durationMs
    inspectorStore.getState().setTransitionTarget({
      transition,
      limitMs: transitionLimitFor(timeline, transition, sourceLengthOf) ?? 0,
      setKind: (kind) =>
        runEdit(`Change transition to ${TRANSITION_LABELS[kind].toLowerCase()}`, (current) =>
          setTransitionKind(current, transition.id, kind)
        ),
      setDuration: (ms, mergeKey) =>
        runEdit(
          'Change transition length',
          (current) => resizeCutTransition(current, transition.id, ms, sourceLengthOf),
          mergeKey
        ),
      remove: () => {
        if (runEdit('Remove transition', (current) => removeTransition(current, transition.id))) {
          setSelection(NO_SELECTION)
        }
      }
    })
  }, [timeline, selection.transitionId, media, runEdit])
  useEffect(() => () => inspectorStore.getState().setTransitionTarget(null), [])

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

  // A press on a fade handle of an audio clip drags the length of that fade. The fade is set on release,
  // as one edit.
  function pressFade(
    event: PointerEvent<HTMLDivElement>,
    clip: Clip,
    track: Track,
    edge: 'in' | 'out'
  ) {
    if (event.button !== 0 || track.locked) return
    event.stopPropagation()
    selectClips(() => [clip.id])

    const startX = event.clientX
    const originMs =
      edge === 'in'
        ? clip.startMs + (clip.fadeInMs ?? 0)
        : clip.startMs + clip.durationMs - (clip.fadeOutMs ?? 0)
    let moved = false
    let last: FadePreview | null = null

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
      moved = true
      const ms = fadeMsFromPointer(clip, edge, originMs + dx / latest.current.pxPerMs)
      last = { clipId: clip.id, edge, ms }
      setFadeDrag(last)
    }

    const release = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      releaseDrag.current = null
      setFadeDrag(null)
    }

    const onEnd = () => {
      const finished = last
      const didMove = moved
      release()
      if (!finished || !didMove) return
      const change = finished.edge === 'in' ? { fadeInMs: finished.ms } : { fadeOutMs: finished.ms }
      try {
        setClipAudio(latest.current.timeline, finished.clipId, change)
      } catch {
        // An invalid fade is not applied.
        return
      }
      latest.current.onEdit(edge === 'in' ? 'Change fade in' : 'Change fade out', (current) =>
        setClipAudio(current, finished.clipId, change)
      )
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
          clipLocked={clip.locked === true}
          selected={selectedIds.includes(clip.id)}
          pxPerMs={pxPerMs}
          range={laneRange}
          media={mediaRef}
          moments={media?.moments}
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
          gainLine={
            track.role === 'music'
              ? gainLinePoints(clip, duckPoints, pxPerMs, CLIP_HEIGHT_PX)
              : undefined
          }
          onPointerDown={(event) => pressClip(event, clip, track)}
          onTrimPointerDown={
            track.locked ? undefined : (edge, event) => pressTrim(event, clip, track, edge)
          }
          onFadePointerDown={
            track.kind === 'audio' && !track.locked
              ? (edge, event) => pressFade(event, clip, track, edge)
              : undefined
          }
          onSelect={() => selectClips(() => [clip.id])}
          onOpenMenu={(anchor) => openClipMenu(clip, track, anchor)}
        />
      )
    })
  }

  // A right-click or Shift+F10 on a clip selects it and opens its clip menu at the anchor point.
  function openClipMenu(clip: Clip, track: Track, anchor: { x: number; y: number }) {
    if (track.locked) return
    selectClips(() => [clip.id])
    setClipMenu({ clipId: clip.id, ...anchor })
  }

  // The clip menu of the clip it was opened on. Its items are the clip's actions (see clipMenuItems).
  function clipMenuNode(): JSX.Element | null {
    if (!clipMenu) return null
    const found = findClip(timeline, clipMenu.clipId)
    if (!found) return null
    const items = clipMenuItems({
      timeline,
      clip: found.clip,
      track: found.track,
      selectedIds,
      runEdit: (label, edit) => {
        runEdit(label, edit)
      },
      newId: () => latest.current.newId(),
      clipSourceLength
    })
    if (items.length === 0) return null
    return (
      <ClipContextMenu
        anchor={{ x: clipMenu.x, y: clipMenu.y }}
        items={items}
        onClose={() => setClipMenu(null)}
      />
    )
  }

  function clipSourceLength(clip: Clip): number | undefined {
    return media?.items.find((ref) => ref.id === clip.mediaId)?.durationMs
  }

  // The transitions on one main track, drawn over their cuts. Each is a window centred on its cut. A press
  // selects it, and the inspector's transition section edits it.
  function transitionElements(trackId: string) {
    const track = timeline.tracks.find((item) => item.id === trackId)
    const clips = new Map((track?.clips ?? []).map((item) => [item.id, item]))
    return (timeline.transitions ?? []).flatMap((transition) => {
      const to = clips.get(transition.toClipId)
      if (!to || !clips.has(transition.fromClipId)) return []
      const window = transitionWindow(transition, to.startMs)
      const seconds = (transition.durationMs / 1000).toFixed(2)
      const label = `${TRANSITION_LABELS[kindOf(transition)]}, ${seconds} s`
      const selected = selection.transitionId === transition.id
      return [
        <div
          key={`transition-${transition.id}`}
          className={
            selected ? `${styles.transition} ${styles.transitionSelected}` : styles.transition
          }
          title={label}
          role="button"
          aria-label={`Transition: ${label}`}
          aria-pressed={selected}
          style={{
            left: timeToX(window.startMs, pxPerMs),
            width: timeToX(transition.durationMs, pxPerMs)
          }}
          onPointerDown={(event) => {
            if (event.button === 0) selectTransition(transition.id)
          }}
        />
      ]
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

  // Loop to fill needs exactly one clip selected, on an unlocked Music lane.
  const selectedLoopTrack =
    selectedIds.length === 1 ? findClip(timeline, selectedIds[0])?.track : undefined
  const loopable = selectedLoopTrack?.role === 'music' && !selectedLoopTrack.locked

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
              {role === 'narration' && shortId ? <RecordNarrationButton shortId={shortId} /> : null}
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
          onDragOver={
            track && isAudioLane(role)
              ? onAudioLaneDragOver
              : track && isVideoRole(role)
                ? (event) => onVideoDragOver(event, track)
                : undefined
          }
          onDragLeave={
            track && isVideoRole(role) ? (event) => onVideoDragLeave(event, track) : undefined
          }
          onDrop={
            track && isAudioLane(role)
              ? (event) => onAudioLaneDrop(event, track)
              : track && isVideoRole(role)
                ? (event) => onVideoDrop(event, track)
                : undefined
          }
        >
          {track ? laneClips(track) : null}
          {track?.role === 'captions' ? (
            <CaptionBlocks
              track={track}
              pxPerMs={pxPerMs}
              playheadMs={playheadMs}
              newId={newTrackId}
              runEdit={runEdit}
            />
          ) : null}
          {track && footageDrop?.trackId === track.id ? (
            <div
              className={styles.dropLine}
              style={{ left: timeToX(footageDrop.startMs, pxPerMs) }}
            />
          ) : null}
          {track?.role === 'main' ? gapElements(track.id) : null}
          {track?.role === 'main' ? transitionElements(track.id) : null}
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
          variant="secondary"
          disabled={!loopable}
          title="Repeat the selected music clip to the length of the short"
          onClick={loopSelectedClip}
        >
          Loop to fill
        </Button>
        <SetPosterButton />
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
      {clipMenuNode()}
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

// The timeline with a fade drag applied. A fade that would be invalid shows the timeline as it was.
function previewFaded(timeline: Timeline, fade: FadePreview | null): Timeline {
  if (!fade) return timeline
  try {
    return setClipAudio(
      timeline,
      fade.clipId,
      fade.edge === 'in' ? { fadeInMs: fade.ms } : { fadeOutMs: fade.ms }
    )
  } catch {
    return timeline
  }
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
