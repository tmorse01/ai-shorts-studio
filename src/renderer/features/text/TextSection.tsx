import { useState, type JSX, type ReactNode } from 'react'
import {
  TEXT_COLOR_NAMES,
  TEXT_STYLE_IDS,
  TEXT_STYLES,
  type TextColorName,
  type TextStyleId
} from '@shared/text/textStyles'
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  scaleTextItem,
  withBackdrop,
  withColor
} from '@shared/text/textEdits'
import {
  TEXT_PRESETS,
  applyTextPresetLook,
  matchTextPreset,
  textPresetOf,
  type TextPresetId
} from '@shared/text/textPresets'
import { Select } from '@renderer/ui/Select'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { TextClipTarget } from '../inspector/inspectorStore'
import { TEXT_COLOUR_LABELS } from './textOptions'
import styles from './TextSection.module.css'

// The inspector's text section (Epic 13, #127), in the Video tab. It edits the one selected text overlay: its
// words, font (the style), size, colour, background and preset. Each change is one undoable edit. Typing and
// slider drags fold into one step.
export function TextSection(): JSX.Element {
  const target = useInspectorStore((state) => state.textTarget)
  if (!target) {
    return <p className={styles.empty}>Select a text clip to see its properties.</p>
  }
  return <TextForm key={target.clip.id} target={target} />
}

interface TextFormProps {
  target: TextClipTarget
}

function TextForm({ target }: TextFormProps): JSX.Element {
  const { clip, item, apply } = target
  // The words are typed into a draft and committed when the field loses focus, so each typed letter does not
  // run an edit.
  const [draft, setDraft] = useState(item.text)
  const fontOptions = TEXT_STYLE_IDS.map((id) => ({ value: id, label: TEXT_STYLES[id].label }))
  const colourOptions = [
    { value: 'style', label: 'Style colour' },
    ...TEXT_COLOR_NAMES.map((name) => ({ value: name, label: TEXT_COLOUR_LABELS[name] }))
  ]
  const backdropOptions = [
    { value: 'none', label: 'None' },
    ...TEXT_COLOR_NAMES.map((name) => ({ value: name, label: TEXT_COLOUR_LABELS[name] }))
  ]
  const presetOptions = [
    ...TEXT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
    { value: 'custom', label: 'Custom', disabled: true }
  ]

  function commitText() {
    if (draft === item.text || draft.trim() === '') {
      setDraft(item.text)
      return
    }
    apply('Edit text', (current) => ({ ...current, text: draft }), `text:${clip.id}`)
  }

  return (
    <div className={styles.body}>
      <Field label="Text">
        <textarea
          aria-label="Text content"
          className={styles.text}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitText}
        />
      </Field>
      <Field label="Font">
        <Select
          aria-label="Text font"
          value={item.styleId}
          options={fontOptions}
          onValueChange={(value) =>
            apply('Change font', (current) => ({ ...current, styleId: value as TextStyleId }))
          }
        />
      </Field>
      <SliderNumberField
        label="Size"
        value={item.scale}
        min={MIN_TEXT_SCALE}
        max={MAX_TEXT_SCALE}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        parse={parsePercent}
        onChange={(value) =>
          apply('Change size', (current) => scaleTextItem(current, value), `size:${clip.id}`)
        }
      />
      <Field label="Colour">
        <Select
          aria-label="Text colour"
          value={item.color ?? 'style'}
          options={colourOptions}
          onValueChange={(value) =>
            apply('Change text colour', (current) =>
              withColor(current, value === 'style' ? undefined : (value as TextColorName))
            )
          }
        />
      </Field>
      <Field label="Background">
        <Select
          aria-label="Text background"
          value={item.backdrop ?? 'none'}
          options={backdropOptions}
          onValueChange={(value) =>
            apply('Change text background', (current) =>
              withBackdrop(current, value === 'none' ? undefined : (value as TextColorName))
            )
          }
        />
      </Field>
      <Field label="Preset">
        <Select
          aria-label="Text preset"
          value={matchTextPreset(item) ?? 'custom'}
          options={presetOptions}
          onValueChange={(value) =>
            apply('Apply text preset', (current) =>
              applyTextPresetLook(current, textPresetOf(value as TextPresetId))
            )
          }
        />
      </Field>
    </div>
  )
}

// Reads a size typed as a percentage ("150" or "150%"), as a scale. Null when the text is not a number.
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
