import type { JSX } from 'react'
import { useStore } from 'zustand'
import { Button } from '@renderer/ui/Button'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { framingPointStore } from '../compositor/framingPointStore'
import { useInspectorStore } from '../inspector/useInspectorStore'
import {
  DEFAULT_PAN_EASE,
  MAX_FRAMING_SCALE,
  MIN_FRAMING_SCALE,
  clearPan,
  poseOf,
  resetFraming,
  setEndFraming,
  withPose,
  type FramingMode,
  type FramingPoint,
  type PanEase
} from '@shared/timeline/framing'
import { formatUnitPercent, formatZoom, parseUnitPercent, parseZoom } from './framingFields'
import styles from './FramingSection.module.css'

const MODE_LABELS: Record<FramingMode, string> = {
  fill: 'Fill',
  blurFit: 'Blur fit'
}

const EASE_LABELS: Record<PanEase, string> = {
  linear: 'Linear',
  easeInOut: 'Ease in-out'
}

type PoseField = 'x' | 'y' | 'scale'

// The inspector's framing section (Epic 09, #105 and #106) for the one selected video clip: the framing
// mode, the crop's X, Y and zoom, the pan toggle with its ease, and a reset. Each change is one undoable
// edit. A slider drag folds into one entry. Blur fit has no crop to move, so the crop fields and the
// pan are shown for fill only.
export function FramingSection(): JSX.Element {
  const target = useInspectorStore((state) => state.framingTarget)
  const requested = useStore(framingPointStore, (state) => state.point)

  if (!target) {
    return <p className={styles.empty}>Select one video clip to frame it.</p>
  }

  const { clipId, framing, apply } = target
  const hasPan = framing.panTo !== undefined
  const point: FramingPoint = requested === 'end' && hasPan ? 'end' : 'start'
  const ease = framing.ease ?? DEFAULT_PAN_EASE
  const pose = poseOf(framing, point)
  const isFill = framing.mode === 'fill'

  function setPoseField(field: PoseField, value: number) {
    apply(
      `Change framing ${field === 'scale' ? 'zoom' : field.toUpperCase()}`,
      (current) => withPose(current, point, { ...poseOf(current, point), [field]: value }),
      `framing-${clipId}-${point}-${field}`
    )
  }

  return (
    <div className={styles.body}>
      <div className={styles.group} role="group" aria-label="Framing mode">
        {(Object.keys(MODE_LABELS) as FramingMode[]).map((mode) => (
          <Button
            key={mode}
            variant="ghost"
            size="sm"
            aria-pressed={framing.mode === mode}
            onClick={() => {
              if (framing.mode !== mode) {
                apply('Change framing mode', (current) => ({ ...current, mode }))
              }
            }}
          >
            {MODE_LABELS[mode]}
          </Button>
        ))}
      </div>

      {isFill ? (
        <>
          <div className={styles.fields}>
            <PoseSlider
              label="X position"
              value={pose.x}
              min={-1}
              max={1}
              step={0.01}
              format={formatUnitPercent}
              parse={parseUnitPercent}
              onChange={(value) => setPoseField('x', value)}
            />
            <PoseSlider
              label="Y position"
              value={pose.y}
              min={-1}
              max={1}
              step={0.01}
              format={formatUnitPercent}
              parse={parseUnitPercent}
              onChange={(value) => setPoseField('y', value)}
            />
            <PoseSlider
              label="Zoom"
              value={pose.scale}
              min={MIN_FRAMING_SCALE}
              max={MAX_FRAMING_SCALE}
              step={0.01}
              format={formatZoom}
              parse={parseZoom}
              onChange={(value) => setPoseField('scale', value)}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-pressed={hasPan}
            onClick={() => {
              if (hasPan) {
                framingPointStore.getState().setPoint('start')
                apply('Clear pan', clearPan)
              } else {
                framingPointStore.getState().setPoint('end')
                apply('Turn on pan', setEndFraming)
              }
            }}
          >
            Pan
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
                      apply('Change pan ease', (current) => ({ ...current, ease: value }))
                    }
                  >
                    {EASE_LABELS[value]}
                  </Button>
                ))}
              </div>
            </>
          ) : null}

          <p className={styles.hint}>
            Drag or nudge the crop on the canvas to frame the {point} pose.
          </p>
        </>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          framingPointStore.getState().setPoint('start')
          apply('Reset framing', resetFraming)
        }}
      >
        Reset framing
      </Button>
    </div>
  )
}

interface PoseSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  parse: (text: string) => number | null
  onChange: (value: number) => void
}

// One labelled number field from the shared field controls.
function PoseSlider({ label, ...field }: PoseSliderProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <SliderNumberField label={label} {...field} />
    </div>
  )
}
