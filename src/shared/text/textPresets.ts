// Template presets for text overlays (Epic 13, #127): a title card, a lower third and a call to action.
// A preset adds a text clip with its look, position and length. Applying one to an existing item changes
// its look and keeps its words and position. Pure data and functions, shared by the renderer and export.
import { IDENTITY_TRANSFORM, type Clip } from '../timeline/timeline'
import type { TextItem, TextMotion } from './textItem'
import type { TextStyleId } from './textStyles'

export const TEXT_PRESET_IDS = ['title-card', 'lower-third', 'call-to-action'] as const
export type TextPresetId = (typeof TEXT_PRESET_IDS)[number]

export interface TextPreset {
  id: TextPresetId
  label: string
  // The words a new clip starts with. The user edits them freely.
  text: string
  styleId: TextStyleId
  scale: number
  enter: TextMotion
  exit: TextMotion
  // Centre of the text as fractions of the frame. Each sits inside the safe zone.
  x: number
  y: number
  // How long a new clip lasts, in ms.
  durationMs: number
}

export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: 'title-card',
    label: 'Title card',
    text: 'Your title',
    styleId: 'display',
    scale: 1,
    enter: 'fade',
    exit: 'fade',
    x: 0.5,
    y: 0.42,
    durationMs: 3000
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    text: 'Location',
    styleId: 'label',
    scale: 1,
    enter: 'fade',
    exit: 'fade',
    x: 0.5,
    y: 0.78,
    durationMs: 4000
  },
  {
    id: 'call-to-action',
    label: 'Call to action',
    text: 'Follow for more',
    styleId: 'heading',
    scale: 1,
    enter: 'fade',
    exit: 'fade',
    x: 0.5,
    y: 0.82,
    durationMs: 3000
  }
]

export function textPresetOf(id: TextPresetId): TextPreset {
  const preset = TEXT_PRESETS.find((item) => item.id === id)
  if (!preset) throw new Error(`Unknown text preset "${id}".`)
  return preset
}

// The item a new clip of this preset starts with.
export function presetItem(preset: TextPreset): TextItem {
  return {
    text: preset.text,
    styleId: preset.styleId,
    x: preset.x,
    y: preset.y,
    scale: preset.scale,
    enter: preset.enter,
    exit: preset.exit
  }
}

// A text clip for a preset, starting at startMs.
export function textPresetClip(preset: TextPreset, clipId: string, startMs: number): Clip {
  return {
    id: clipId,
    startMs,
    durationMs: preset.durationMs,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    textItem: presetItem(preset)
  }
}

// The item with the preset's look: style, size and motion. Its words and position stay. A colour or backdrop
// the user set is cleared, so the result shows the preset's look exactly.
export function applyTextPresetLook(item: TextItem, preset: TextPreset): TextItem {
  return {
    text: item.text,
    x: item.x,
    y: item.y,
    styleId: preset.styleId,
    scale: preset.scale,
    enter: preset.enter,
    exit: preset.exit
  }
}

// The preset whose look an item has now, or null when it matches none (a custom look).
export function matchTextPreset(item: TextItem): TextPresetId | null {
  const match = TEXT_PRESETS.find(
    (preset) =>
      preset.styleId === item.styleId &&
      preset.scale === item.scale &&
      preset.enter === item.enter &&
      preset.exit === item.exit &&
      item.color === undefined &&
      item.backdrop === undefined
  )
  return match?.id ?? null
}
