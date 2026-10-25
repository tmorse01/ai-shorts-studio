import { useState, type JSX, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  CAPTION_POSITIONS,
  MAX_WORDS_PER_CAPTION,
  MIN_WORDS_PER_CAPTION,
  captionPresetsOf,
  resolveCaptionPreset,
  wordsPerCaptionOf,
  type CaptionPosition,
  type CaptionPreset
} from '@shared/captions/captionPreset'
import { TEXT_COLOR_NAMES, type TextColorName, type TextFontRole } from '@shared/text/textStyles'
import { Select } from '@renderer/ui/Select'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { Switch } from '@renderer/ui/Switch'
import { Input } from '@renderer/ui/Input'
import { Button } from '@renderer/ui/Button'
import { editorHistory } from '../history/editorHistory'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { TEXT_COLOUR_LABELS } from '../text/textOptions'
import {
  saveCaptionPresetCommand,
  setShortCaptionPresetCommand,
  updateCaptionPresetCommand,
  type CaptionPresetChange
} from './captionPresetCommands'
import styles from './CaptionStyleSection.module.css'

const FONT_OPTIONS: { value: TextFontRole; label: string }[] = [
  { value: 'display', label: 'Display' },
  { value: 'heading', label: 'Heading' },
  { value: 'ui', label: 'Interface' }
]

const POSITION_LABELS: Record<CaptionPosition, string> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom'
}

const COLOUR_OPTIONS = TEXT_COLOR_NAMES.map((name) => ({
  value: name,
  label: TEXT_COLOUR_LABELS[name]
}))

const POSITION_OPTIONS = CAPTION_POSITIONS.map((value) => ({
  value,
  label: POSITION_LABELS[value]
}))

// The inspector's caption style section (Epic 11, #121). It shows for the open short. The preset picker sets
// the short's preset; the fields edit the preset itself at project level, so every short that uses it shows
// the change. Each edit is one command in the project history; drags fold into one step.
export function CaptionStyleSection(): JSX.Element {
  const activeId = useStore(editorHistory.selection, (state) => state.activeId)
  const project = useProjectStore((state) => state.current?.project)
  const short = project?.shorts.find((item) => item.id === activeId)

  if (!project || !short) {
    return <p className={styles.empty}>Open a short to see its caption style.</p>
  }

  return (
    <CaptionStyleForm
      key={short.id}
      shortId={short.id}
      presets={captionPresetsOf(project.captionPresets)}
      shortPresetId={short.captionPresetId}
    />
  )
}

interface CaptionStyleFormProps {
  shortId: string
  presets: readonly CaptionPreset[]
  shortPresetId: string | undefined
}

function CaptionStyleForm({ shortId, presets, shortPresetId }: CaptionStyleFormProps): JSX.Element {
  const preset = resolveCaptionPreset(presets, shortPresetId, undefined)
  const [copyName, setCopyName] = useState(`${preset.label} copy`)
  const presetOptions = presets.map((item) => ({ value: item.id, label: item.label }))
  const outline = preset.stroke

  function edit(change: CaptionPresetChange, label: string, field: string): void {
    applyProjectCommand(
      updateCaptionPresetCommand(preset.id, change, label, `caption-style:${preset.id}:${field}`)
    )
  }

  function saveCopy(): void {
    const label = copyName.trim()
    if (label === '') return
    applyProjectCommand(
      saveCaptionPresetCommand({
        id: globalThis.crypto.randomUUID(),
        label,
        source: preset,
        shortId,
        now: new Date().toISOString()
      })
    )
  }

  return (
    <div className={styles.body}>
      <Field label="Preset">
        <Select
          aria-label="Caption preset"
          value={preset.id}
          options={presetOptions}
          onValueChange={(value) =>
            applyProjectCommand(
              setShortCaptionPresetCommand(shortId, value, new Date().toISOString())
            )
          }
        />
      </Field>

      <Field label="Save as new preset">
        <div className={styles.saveRow}>
          <Input
            aria-label="New preset name"
            value={copyName}
            onChange={(event) => setCopyName(event.target.value)}
          />
          <Button onClick={saveCopy} disabled={copyName.trim() === ''}>
            Save
          </Button>
        </div>
      </Field>

      <Field label="Font">
        <Select
          aria-label="Caption font"
          value={preset.font}
          options={FONT_OPTIONS}
          onValueChange={(value) =>
            edit({ font: value as TextFontRole }, 'Change caption font', 'font')
          }
        />
      </Field>

      <SliderNumberField
        label="Size"
        value={preset.sizePx}
        min={40}
        max={160}
        step={1}
        format={(value) => `${Math.round(value)} px`}
        parse={parsePixels}
        onChange={(value) => edit({ sizePx: Math.round(value) }, 'Change caption size', 'size')}
      />

      <Field label="Text colour">
        <Select
          aria-label="Caption text colour"
          value={preset.fill}
          options={COLOUR_OPTIONS}
          onValueChange={(value) =>
            edit({ fill: value as TextColorName }, 'Change caption colour', 'fill')
          }
        />
      </Field>

      <Field label="Highlight colour">
        <Select
          aria-label="Caption highlight colour"
          value={preset.highlight}
          options={COLOUR_OPTIONS}
          onValueChange={(value) =>
            edit({ highlight: value as TextColorName }, 'Change highlight colour', 'highlight')
          }
        />
      </Field>

      <Switch
        checked={outline !== undefined}
        onCheckedChange={(checked) =>
          edit(
            { stroke: checked ? { color: 'void', widthPx: 6 } : undefined },
            checked ? 'Add caption outline' : 'Remove caption outline',
            'outline'
          )
        }
      >
        Outline
      </Switch>

      {outline ? (
        <>
          <Field label="Outline colour">
            <Select
              aria-label="Caption outline colour"
              value={outline.color}
              options={COLOUR_OPTIONS}
              onValueChange={(value) =>
                edit(
                  { stroke: { color: value as TextColorName, widthPx: outline.widthPx } },
                  'Change outline colour',
                  'outline-colour'
                )
              }
            />
          </Field>
          <SliderNumberField
            label="Outline width"
            value={outline.widthPx}
            min={0}
            max={16}
            step={1}
            format={(value) => `${Math.round(value)} px`}
            parse={parsePixels}
            onChange={(value) =>
              edit(
                { stroke: { color: outline.color, widthPx: Math.round(value) } },
                'Change outline width',
                'outline-width'
              )
            }
          />
        </>
      ) : null}

      <Field label="Position">
        <Select
          aria-label="Caption position"
          value={preset.position ?? 'bottom'}
          options={POSITION_OPTIONS}
          onValueChange={(value) =>
            edit({ position: value as CaptionPosition }, 'Change caption position', 'position')
          }
        />
      </Field>

      <SliderNumberField
        label="Words per caption"
        value={wordsPerCaptionOf(preset)}
        min={MIN_WORDS_PER_CAPTION}
        max={MAX_WORDS_PER_CAPTION}
        step={1}
        format={(value) => String(Math.round(value))}
        parse={parseWhole}
        onChange={(value) =>
          edit({ wordsPerCaption: Math.round(value) }, 'Change words per caption', 'words')
        }
      />

      <p className={styles.note}>
        Changes apply to every short that uses this preset. Words per caption applies the next time
        captions are generated.
      </p>
    </div>
  )
}

// Reads a size typed as "76" or "76 px". Null when the text is not a number.
function parsePixels(text: string): number | null {
  const number = Number.parseFloat(text.replace(/px$/i, '').trim())
  return Number.isFinite(number) ? number : null
}

function parseWhole(text: string): number | null {
  const number = Number.parseInt(text.trim(), 10)
  return Number.isFinite(number) ? number : null
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
