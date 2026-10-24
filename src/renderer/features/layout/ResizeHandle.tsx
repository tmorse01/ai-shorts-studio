import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { KEY_RESIZE_STEP } from './paneSizing'
import styles from './ResizeHandle.module.css'

export interface ResizeHandleProps {
  /** 'x' is a vertical edge (side panes); 'y' is a horizontal edge (the bottom pane). */
  axis: 'x' | 'y'
  /** Which way the pane grows: +1 when the pointer moves forward (right or down), -1 backward. */
  grow: 1 | -1
  /** Which edge of the pane the handle sits on. */
  edge: 'left' | 'right' | 'top'
  /** Current pane size in px. */
  size: number
  label: string
  /** Called with the requested size. The caller clamps it. */
  onResize: (size: number) => void
}

// A drag handle on a pane edge. Dragging computes the size from where the drag started, so it does
// not drift. Arrow keys nudge the size, so the layout works without a mouse.
export function ResizeHandle({ axis, grow, edge, size, label, onResize }: ResizeHandleProps) {
  const drag = useRef<{ start: number; size: number } | null>(null)

  const position = (event: PointerEvent<HTMLDivElement>) =>
    axis === 'x' ? event.clientX : event.clientY

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { start: position(event), size }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    onResize(drag.current.size + grow * (position(event) - drag.current.start))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The arrow key that grows the pane depends on the axis and direction.
    const [growKey, shrinkKey] =
      axis === 'x'
        ? grow === 1
          ? ['ArrowRight', 'ArrowLeft']
          : ['ArrowLeft', 'ArrowRight']
        : grow === 1
          ? ['ArrowDown', 'ArrowUp']
          : ['ArrowUp', 'ArrowDown']

    if (event.key === growKey) {
      event.preventDefault()
      onResize(size + KEY_RESIZE_STEP)
    } else if (event.key === shrinkKey) {
      event.preventDefault()
      onResize(size - KEY_RESIZE_STEP)
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      className={[styles.handle, styles[axis], styles[edge]].join(' ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  )
}
