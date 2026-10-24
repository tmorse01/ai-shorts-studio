import type { JSX } from 'react'
import { useStore } from 'zustand'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  framingOutlines,
  placeTransform,
  type Placement
} from '@shared/compositor/frame'
import type { Guides, Handle } from '@shared/compositor/gizmo'
import { layerFrameStore } from './layerFrameStore'
import { layerSelectionStore } from './layerSelectionStore'
import styles from './CanvasGizmo.module.css'

const HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw']

// The box's position and size on the overlay, in percent of the canvas. The rotation turns it with the
// layer.
function boxStyle(placement: Placement) {
  return {
    left: `${((placement.centerX - placement.width / 2) / CANVAS_WIDTH) * 100}%`,
    top: `${((placement.centerY - placement.height / 2) / CANVAS_HEIGHT) * 100}%`,
    width: `${(placement.width / CANVAS_WIDTH) * 100}%`,
    height: `${(placement.height / CANVAS_HEIGHT) * 100}%`,
    transform: `rotate(${placement.rotationDeg}deg)`
  }
}

export interface CanvasGizmoProps {
  guides: Guides
}

// The selection box over the preview frame: a lavender outline around the selected layer, a handle at
// each corner, and the snap lines while a drag is snapped. A fill-framed clip with a pan also shows its
// start crop and, when there is one, its end crop as dashed outlines. Pointer events pass through to
// the frame, which does the hit testing, so the box never takes a press itself.
export function CanvasGizmo({ guides }: CanvasGizmoProps): JSX.Element | null {
  const selectedClipId = useStore(layerSelectionStore, (state) => state.selectedClipId)
  const frame = useStore(layerFrameStore, (state) => state.frame)
  const layer =
    selectedClipId === null
      ? undefined
      : frame?.layers.find((item) => item.clipId === selectedClipId)
  const placement = layer?.placement
  if (!placement) return null

  const outlines =
    layer?.clipFraming && layer.source
      ? framingOutlines(
          layer.source,
          placeTransform(layer.transform, layer.source),
          layer.clipFraming
        )
      : null

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div className={styles.box} style={boxStyle(placement)}>
        {HANDLES.map((handle) => (
          <span key={handle} className={`${styles.handle} ${styles[handle]}`} />
        ))}
      </div>
      {outlines ? <div className={styles.outlineStart} style={boxStyle(outlines.start)} /> : null}
      {outlines?.end ? <div className={styles.outlineEnd} style={boxStyle(outlines.end)} /> : null}
      {guides.x.map((x) => (
        <span
          key={`x-${x}`}
          className={styles.guideX}
          style={{ left: `${(x / CANVAS_WIDTH) * 100}%` }}
        />
      ))}
      {guides.y.map((y) => (
        <span
          key={`y-${y}`}
          className={styles.guideY}
          style={{ top: `${(y / CANVAS_HEIGHT) * 100}%` }}
        />
      ))}
    </div>
  )
}
