// Pointer and keyboard handling for the preview canvas gizmo. A press selects the layer under the
// pointer (or grabs a handle of the selected one), a drag moves or scales it, and the arrow keys nudge
// it while the canvas has focus. The maths is in shared/compositor/gizmo.ts; this hook only reads the
// stores, converts coordinates and records each gesture as one command.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
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
import { playbackStore } from '../playback/playbackStore'
import { layerFrameStore } from './layerFrameStore'
import { layerRegistry } from './layerRenderers'
import { layerSelectionStore } from './layerSelectionStore'
import { applyTransformEdit } from './layerTransformCommands'

// How far from a corner handle a press still counts as grabbing it, in screen pixels.
const HANDLE_RADIUS_PX = 12

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
    (layer) => layer.mediaId !== undefined && layerRegistry.supportsTransform(layer.trackKind)
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

    const start: Transform = found.clip.transform
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
      mergeKey: `gizmo:${target.clipId}:${dragCount.current}`
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
    applyTransformEdit(active.shortId, active.clipId, active.label, active.mergeKey, () => next)
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
    applyTransformEdit(shortId, selectedId, 'Nudge layer', `nudge:${selectedId}`, (current) =>
      moveTransform(current, offset.x, offset.y)
    )
    // The arrows nudge the layer, so they do not also step the playhead.
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    guides,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onKeyDown
    }
  }
}
