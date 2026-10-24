import type { JSX } from 'react'
import { useStore } from 'zustand'
import { Button } from '@renderer/ui/Button'
import { framingPointStore } from '../compositor/framingPointStore'
import { useInspectorStore } from '../inspector/useInspectorStore'
import { clearPan, DEFAULT_PAN_EASE, setEndFraming, type PanEase } from '@shared/timeline/framing'
import styles from './PanSection.module.css'

const EASE_LABELS: Record<PanEase, string> = {
  linear: 'Linear',
  easeInOut: 'Ease in-out'
}

// The inspector's pan section (Epic 09, #105): a pan from the start framing to an end framing across
// the clip. "Set end framing" captures the current framing as the end, and the canvas gizmo then edits
// the pose the Start and End buttons pick. Each change is one undoable edit.
export function PanSection(): JSX.Element {
  const target = useInspectorStore((state) => state.framingTarget)
  const requested = useStore(framingPointStore, (state) => state.point)

  if (!target) {
    return <p className={styles.empty}>Select a video clip with fill framing to pan its crop.</p>
  }

  const { framing } = target
  const hasPan = framing.panTo !== undefined
  const point = requested === 'end' && hasPan ? 'end' : 'start'
  const ease = framing.ease ?? DEFAULT_PAN_EASE

  return (
    <div className={styles.body}>
      <Button
        variant="secondary"
        onClick={() => {
          framingPointStore.getState().setPoint('end')
          target.apply('Set end framing', setEndFraming)
        }}
      >
        Set end framing
      </Button>
      {hasPan ? (
        <>
          <div className={styles.group} role="group" aria-label="Pose to edit">
            {(['start', 'end'] as const).map((value) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                aria-pressed={point === value}
                onClick={() => framingPointStore.getState().setPoint(value)}
              >
                {value === 'start' ? 'Start' : 'End'}
              </Button>
            ))}
          </div>
          <div className={styles.group} role="group" aria-label="Pan ease">
            {(Object.keys(EASE_LABELS) as PanEase[]).map((value) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                aria-pressed={ease === value}
                onClick={() =>
                  target.apply('Change pan ease', (current) => ({ ...current, ease: value }))
                }
              >
                {EASE_LABELS[value]}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              framingPointStore.getState().setPoint('start')
              target.apply('Clear pan', clearPan)
            }}
          >
            Clear pan
          </Button>
        </>
      ) : null}
      <p className={styles.hint}>Drag or nudge the crop on the canvas to frame the {point} pose.</p>
    </div>
  )
}
