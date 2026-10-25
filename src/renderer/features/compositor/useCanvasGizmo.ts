// Pointer and keyboard handling for the preview canvas gizmo. A press selects the layer under the
// pointer (or grabs a handle of the selected one), a drag moves or scales it, and the arrow keys nudge
// it while the canvas has focus. The maths is in shared/compositor/gizmo.ts; this hook only reads the
// stores, converts coordinates and records each gesture as one command.
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject
} from 'react'
import type { Clip, Timeline, Track, Transform } from '@shared/timeline/timeline'
import {
  dragTransform,
  hitTest,
  moveTransform,
  nudgeOffset,
  NO_GUIDES,
  pickLayer,
  screenToCanvasPx,
  toCanvasPoint,
  type DragSession,
  type Guides,
  type NudgeDirection
} from '@shared/compositor/gizmo'
import { CANVAS_HEIGHT, CANVAS_WIDTH, type FrameLayer } from '@shared/compositor/frame'
import type { TextItem } from '@shared/text/textItem'
import { moveTextItem, nudgeTextItem, scaleTextItem } from '@shared/text/textEdits'
import {
  CENTRED_FILL,
  framingAfterGesture,
  poseOf,
  withPose,
  type ClipFraming,
  type FramingPoint
} from '@shared/timeline/framing'
import { playbackStore } from '../playback/playbackStore'
import { layerFrameStore } from './layerFrameStore'
import { layerRegistry } from './layerRenderers'
import { layerSelectionStore } from './layerSelectionStore'
import { framingPointStore } from './framingPointStore'
import { rememberFraming } from './framingMemory'
import { textEditStore } from '../text/textEditStore'
import {
  applyFramingEdit,
  applyTextItemEdit,
  applyTransformEdit,
  GESTURE_MERGE_WINDOW_MS
} from './layerTransformCommands'

// How far from a corner handle a press still counts as grabbing it, in screen pixels.
const HANDLE_RADIUS_PX = 12

// A fill-framed video layer is edited through its framing: the gizmo moves the crop and zooms it,
// instead of moving the layer's transform. The pose it edits is the start or the end of the pan, as
// the pan section selects (the end falls back to the start when the clip has no pan).
interface FramedEdit {
  mediaId: string
  framing: ClipFraming
  point: FramingPoint
  source: { width: number; height: number }
}

// The framing edit for a layer, when the gizmo edits its framing. Blur-fit clips keep the transform.
function framedEditFor(layer: FrameLayer, clip: Clip): FramedEdit | null {
  if (layer.trackKind !== 'video' || !layer.source || !clip.mediaId) return null
  const framing = clip.framing ?? { ...CENTRED_FILL }
  if (framing.mode !== 'fill') return null
  const requested = framingPointStore.getState().point
  const point: FramingPoint = requested === 'end' && framing.panTo ? 'end' : 'start'
  return { mediaId: clip.mediaId, framing, point, source: layer.source }
}

function applyFramedGesture(
  shortId: string,
  clipId: string,
  label: string,
  mergeKey: string,
  framed: FramedEdit,
  gesture: { dxCanvas: number; dyCanvas: number; scaleFactor: number },
  mergeWindowMs?: number
): void {
  const pose = framingAfterGesture(poseOf(framed.framing, framed.point), gesture, framed.source, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT
  })
  const next: ClipFraming = withPose(framed.framing, framed.point, pose)
  applyFramingEdit(shortId, clipId, label, mergeKey, () => next, mergeWindowMs)
  rememberFraming(framed.mediaId, next)
}

const ARROW_DIRECTIONS: Record<string, NudgeDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

interface ActiveDrag {
  session: DragSession
  clipId: string
  shortId: string
  label: string
  mergeKey: string
  framed: FramedEdit | null
  // The text item a text overlay started the drag with. Set only for a text overlay, which moves and scales
  // its item instead of the clip's transform.
  startItem: TextItem | null
}

export interface UseCanvasGizmoOptions {
  shortId?: string
  timeline: Timeline
  frameRef: RefObject<HTMLDivElement>
}

export interface CanvasGizmoHandlers {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void
}

export interface UseCanvasGizmoResult {
  // Snap lines to draw while a drag is snapped.
  guides: Guides
  handlers: CanvasGizmoHandlers
}

// Finds a clip and the track it sits on.
export function findClip(timeline: Timeline, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}

// The layers on the canvas that opt in to the gizmo, from the frame the preview last drew.
function transformableLayers() {
  const frame = layerFrameStore.getState().frame
  if (!frame) return []
  return frame.layers.filter(
    (layer) =>
      (layer.mediaId !== undefined || layer.textItem !== undefined) &&
      layerRegistry.supportsTransform(layer.trackKind)
  )
}

export function useCanvasGizmo({
  shortId,
  timeline,
  frameRef
}: UseCanvasGizmoOptions): UseCanvasGizmoResult {
  const [guides, setGuides] = useState<Guides>(NO_GUIDES)
  const drag = useRef<ActiveDrag | null>(null)
  const dragCount = useRef(0)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current
    if (!shortId || !frame || event.button !== 0 || playbackStore.getState().playing) return

    const rect = frame.getBoundingClientRect()
    const point = toCanvasPoint(event.clientX, event.clientY, rect)
    const radius = screenToCanvasPx(HANDLE_RADIUS_PX, rect)
    const layers = transformableLayers()
    const selectedId = layerSelectionStore.getState().selectedClipId
    const selected = layers.find((layer) => layer.clipId === selectedId)

    let target = selected
    let hit = selected ? hitTest(point, selected.placement, radius) : null
    if (!hit) {
      const picked = pickLayer(point, layers)
      if (!picked) {
        layerSelectionStore.getState().select(null)
        return
      }
      layerSelectionStore.getState().select(picked.clipId)
      target = picked
      hit = { kind: 'move' }
    }
    if (!target) return

    const found = findClip(timeline, target.clipId)
    // A locked track keeps its layers where they are; the layer stays selected.
    if (!found || found.track.locked) return

    // A text overlay's gesture starts from an identity transform at its item's scale: the drag's offset is
    // then the move in canvas pixels and its scale ratio is the new scale.
    const startItem = found.clip.textItem ?? null
    const start: Transform = startItem
      ? { x: 0, y: 0, scale: startItem.scale, rotationDeg: 0 }
      : found.clip.transform
    const session: DragSession =
      hit.kind === 'move'
        ? { kind: 'move', start, startPlacement: target.placement, origin: point }
        : { kind: 'scale', handle: hit.handle, start, startPlacement: target.placement }
    dragCount.current += 1
    drag.current = {
      session,
      clipId: target.clipId,
      shortId,
      label: hit.kind === 'move' ? 'Move layer' : 'Scale layer',
      mergeKey: `gizmo:${target.clipId}:${dragCount.current}`,
      framed: framedEditFor(target, found.clip),
      startItem
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    const frame = frameRef.current
    if (!active || !frame) return

    const point = toCanvasPoint(event.clientX, event.clientY, frame.getBoundingClientRect())
    const result = dragTransform(active.session, point, event.shiftKey)
    setGuides(result.guides)
    const next = result.transform
    if (active.startItem) {
      const item = active.startItem
      const moved = moveTextItem(
        item,
        item.x * CANVAS_WIDTH + next.x,
        item.y * CANVAS_HEIGHT + next.y,
        { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
      )
      const nextItem = scaleTextItem(moved, next.scale)
      applyTextItemEdit(
        active.shortId,
        active.clipId,
        active.label,
        active.mergeKey,
        () => nextItem,
        GESTURE_MERGE_WINDOW_MS
      )
      return
    }
    if (active.framed) {
      // The transform gives the drag's offset and scale ratio; the framing takes them from its start.
      const start = active.session.start
      applyFramedGesture(
        active.shortId,
        active.clipId,
        active.label,
        active.mergeKey,
        active.framed,
        {
          dxCanvas: next.x - start.x,
          dyCanvas: next.y - start.y,
          scaleFactor: next.scale / start.scale
        },
        GESTURE_MERGE_WINDOW_MS
      )
      return
    }
    applyTransformEdit(
      active.shortId,
      active.clipId,
      active.label,
      active.mergeKey,
      () => next,
      GESTURE_MERGE_WINDOW_MS
    )
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    setGuides(NO_GUIDES)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!shortId || event.ctrlKey || event.metaKey || event.altKey) return
    const selectedId = layerSelectionStore.getState().selectedClipId
    if (!selectedId) return

    if (event.key === 'Escape') {
      layerSelectionStore.getState().select(null)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const direction = ARROW_DIRECTIONS[event.key]
    if (!direction) return
    const found = findClip(timeline, selectedId)
    if (!found || found.track.locked) return

    const offset = nudgeOffset(direction, event.shiftKey)
    if (found.clip.textItem) {
      applyTextItemEdit(shortId, selectedId, 'Nudge text', `nudge:${selectedId}`, (current) =>
        nudgeTextItem(current, offset.x, offset.y, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
      )
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const layer = transformableLayers().find((item) => item.clipId === selectedId)
    const framed = layer ? framedEditFor(layer, found.clip) : null
    if (framed) {
      // Read the framing as it is stored now, so quick repeated presses each move from the last one.
      applyFramingEdit(shortId, selectedId, 'Nudge layer', `nudge:${selectedId}`, (current) => {
        const pose = framingAfterGesture(
          poseOf(current, framed.point),
          { dxCanvas: offset.x, dyCanvas: offset.y, scaleFactor: 1 },
          framed.source,
          { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
        )
        const next = withPose(current, framed.point, pose)
        rememberFraming(framed.mediaId, next)
        return next
      })
    } else {
      applyTransformEdit(shortId, selectedId, 'Nudge layer', `nudge:${selectedId}`, (current) =>
        moveTransform(current, offset.x, offset.y)
      )
    }
    // The arrows nudge the layer, so they do not also step the playhead.
    event.preventDefault()
    event.stopPropagation()
  }

  // A double click on a text overlay opens its editor on the canvas. Only a paused frame edits.
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const frame = frameRef.current
    if (!shortId || !frame || playbackStore.getState().playing) return
    const point = toCanvasPoint(event.clientX, event.clientY, frame.getBoundingClientRect())
    const picked = pickLayer(point, transformableLayers())
    if (!picked?.textItem) return
    const found = findClip(timeline, picked.clipId)
    if (!found || found.track.locked) return
    layerSelectionStore.getState().select(picked.clipId)
    textEditStore.getState().start(picked.clipId)
    event.preventDefault()
  }

  return {
    guides,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onKeyDown,
      onDoubleClick
    }
  }
}
