import type { JSX } from 'react'
import { useStore } from 'zustand'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@shared/compositor/frame'
import type { Guides, Handle } from '@shared/compositor/gizmo'
import { layerFrameStore } from './layerFrameStore'
import { layerSelectionStore } from './layerSelectionStore'
import styles from './CanvasGizmo.module.css'

const HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw']

export interface CanvasGizmoProps {
  guides: Guides
}

// The selection box over the preview frame: a lavender outline around the selected layer, a handle at
// each corner, and the snap lines while a drag is snapped. Pointer events pass through to the frame,
// which does the hit testing, so the box never takes a press itself.
export function CanvasGizmo({ guides }: CanvasGizmoProps): JSX.Element | null {
  const selectedClipId = useStore(layerSelectionStore, (state) => state.selectedClipId)
  const frame = useStore(layerFrameStore, (state) => state.frame)
  const placement =
    selectedClipId === null
      ? undefined
      : frame?.layers.find((layer) => layer.clipId === selectedClipId)?.placement
  if (!placement) return null

  const left = ((placement.centerX - placement.width / 2) / CANVAS_WIDTH) * 100
  const top = ((placement.centerY - placement.height / 2) / CANVAS_HEIGHT) * 100

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div
        className={styles.box}
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${(placement.width / CANVAS_WIDTH) * 100}%`,
          height: `${(placement.height / CANVAS_HEIGHT) * 100}%`,
          transform: `rotate(${placement.rotationDeg}deg)`
        }}
      >
        {HANDLES.map((handle) => (
          <span key={handle} className={`${styles.handle} ${styles[handle]}`} />
        ))}
      </div>
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
