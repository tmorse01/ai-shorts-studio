import type { JSX, ReactNode } from 'react'
import { TEXT_MOTIONS, type TextMotion } from '@shared/text/textItem'
import {
  MAX_TEXT_MOTION_MS,
  MIN_TEXT_MOTION_MS,
  TEXT_MOTION_DEFAULT_MS
} from '@shared/text/textMotion'
import { MAX_IMAGE_OPACITY, MIN_IMAGE_OPACITY, type ImageItem } from '@shared/image/imageItem'
import { imageOpacityOf } from '@shared/image/imageOverlay'
import { Select } from '@renderer/ui/Select'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { ImageClipTarget } from '../inspector/inspectorStore'
import { TEXT_MOTION_LABELS } from '../text/textOptions'
import styles from './ImageSection.module.css'

// The inspector's image section (Epic 13, #129), in the Video tab. It edits the one selected image overlay: its
// opacity and its entry and exit motion. Position and size are the clip transform, edited on the canvas gizmo.
// Each change is one undoable edit, and a slider drag folds into one step.
export function ImageSection(): JSX.Element {
  const target = useInspectorStore((state) => state.imageTarget)
  if (!target) {
    return <p className={styles.empty}>Select an image clip to see its properties.</p>
  }
  return <ImageForm key={target.clip.id} target={target} />
}

interface ImageFormProps {
  target: ImageClipTarget
}

function ImageForm({ target }: ImageFormProps): JSX.Element {
  const { clip, item, apply } = target
  const motionOptions = TEXT_MOTIONS.map((id) => ({ value: id, label: TEXT_MOTION_LABELS[id] }))

  return (
    <div className={styles.body}>
      <SliderNumberField
        label="Opacity"
        value={imageOpacityOf(item)}
        min={MIN_IMAGE_OPACITY}
        max={MAX_IMAGE_OPACITY}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        parse={parsePercent}
        onChange={(value) =>
          apply('Change opacity', (current) => withOpacity(current, value), `opacity:${clip.id}`)
        }
      />
      <Field label="In">
        <Select
          aria-label="Image entry motion"
          value={item.enter ?? 'none'}
          options={motionOptions}
          onValueChange={(value) =>
            apply('Change image entry', (current) => ({
              ...current,
              enter: value as TextMotion
            }))
          }
        />
      </Field>
      <Field label="Out">
        <Select
          aria-label="Image exit motion"
          value={item.exit ?? 'none'}
          options={motionOptions}
          onValueChange={(value) =>
            apply('Change image exit', (current) => ({ ...current, exit: value as TextMotion }))
          }
        />
      </Field>
      <SliderNumberField
        label="Motion length"
        value={item.motionMs ?? TEXT_MOTION_DEFAULT_MS}
        min={MIN_TEXT_MOTION_MS}
        max={MAX_TEXT_MOTION_MS}
        step={50}
        format={(value) => `${Math.round(value)} ms`}
        parse={parseMilliseconds}
        onChange={(value) =>
          apply(
            'Change motion length',
            (current) => ({ ...current, motionMs: Math.round(value) }),
            `motion:${clip.id}`
          )
        }
      />
    </div>
  )
}

// The opacity with its value clamped to the item's range, so a typed value outside it cannot reach the schema.
function withOpacity(item: ImageItem, opacity: number): ImageItem {
  const clamped = Math.min(Math.max(opacity, MIN_IMAGE_OPACITY), MAX_IMAGE_OPACITY)
  return { ...item, opacity: clamped }
}

// Reads a length typed in ms ("400" or "400 ms"). Null when the text is not a number.
function parseMilliseconds(text: string): number | null {
  const number = Number.parseFloat(text.replace('ms', '').trim())
  return Number.isFinite(number) ? number : null
}

// Reads an opacity typed as a percentage ("80" or "80%"), as a fraction. Null when the text is not a number.
function parsePercent(text: string): number | null {
  const number = Number.parseFloat(text.replace('%', '').trim())
  if (!Number.isFinite(number)) return null
  return number / 100
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the other inspector rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
