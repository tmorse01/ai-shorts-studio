import { useRef, type JSX, type PointerEvent } from 'react'
import { scrubValue } from './fieldMath'
import styles from './ScrubLabel.module.css'

export interface ScrubLabelProps {
  label: string
  value: number
  // Shown as an em dash when the selection has several values.
  mixed?: boolean
  format: (value: number) => string
  // The value change for one pixel of drag, before Shift or Ctrl scaling.
  step: number
  onChange: (value: number) => void
}

// A label you drag left or right to change a number. Shift drags finer and Ctrl drags coarser.
// Each move calls onChange; the caller merges the drag into one history entry with a mergeKey.
export function ScrubLabel({
  label,
  value,
  mixed,
  format,
  step,
  onChange
}: ScrubLabelProps): JSX.Element {
  const drag = useRef<{ startX: number; startValue: number } | null>(null)

  function handleDown(event: PointerEvent<HTMLSpanElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startValue: value }
  }

  function handleMove(event: PointerEvent<HTMLSpanElement>) {
    if (!drag.current) return
    const dragPx = event.clientX - drag.current.startX
    onChange(
      scrubValue(drag.current.startValue, dragPx, step, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey
      })
    )
  }

  function handleUp() {
    drag.current = null
  }

  const shown = mixed ? '—' : format(value)
  return (
    <span
      className={styles.scrub}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={mixed ? undefined : value}
      aria-valuetext={shown}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{shown}</span>
    </span>
  )
}
