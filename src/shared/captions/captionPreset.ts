// Caption style presets (Epic 11, #119). A preset is the look of a caption block: font, size, colours,
// stroke, and whether words highlight and pop in. Presets live in the project (`captionPresets`), with a
// per-short default (`captionPresetId`) and a per-block override (`CaptionBlock.styleId`). Pure data
// and zod schemas, shared by main, the renderer and export.
import { z } from 'zod'
import { TEXT_PALETTE, textFontRoleSchema, type TextColorName } from '../text/textStyles'

const nonEmptyString = z.string().trim().min(1)

const colorNames = Object.keys(TEXT_PALETTE) as [TextColorName, ...TextColorName[]]
export const captionColorSchema = z.enum(colorNames)

export const captionPresetSchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  font: textFontRoleSchema,
  weight: z.number().int().min(100).max(900),
  // Font size in canvas pixels (the canvas is 1080 by 1920).
  sizePx: z.number().positive(),
  uppercase: z.boolean(),
  letterSpacingPx: z.number().nonnegative(),
  fill: captionColorSchema,
  // The colour of the word being spoken, when highlightWords is on.
  highlight: captionColorSchema,
  stroke: z.object({ color: captionColorSchema, widthPx: z.number().nonnegative() }).optional(),
  highlightWords: z.boolean(),
  popIn: z.boolean()
})
export type CaptionPreset = z.infer<typeof captionPresetSchema>

export const DEFAULT_CAPTION_PRESETS: readonly CaptionPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    font: 'ui',
    weight: 700,
    sizePx: 76,
    uppercase: false,
    letterSpacingPx: 0,
    fill: 'white',
    highlight: 'sage',
    stroke: { color: 'void', widthPx: 6 },
    highlightWords: true,
    popIn: true
  },
  {
    id: 'bold',
    label: 'Bold',
    font: 'heading',
    weight: 600,
    sizePx: 96,
    uppercase: true,
    letterSpacingPx: 4,
    fill: 'white',
    highlight: 'ivory',
    stroke: { color: 'void', widthPx: 8 },
    highlightWords: true,
    popIn: true
  },
  {
    id: 'editorial',
    label: 'Editorial',
    font: 'display',
    weight: 600,
    sizePx: 92,
    uppercase: false,
    letterSpacingPx: 0,
    fill: 'ivory',
    highlight: 'white',
    highlightWords: false,
    popIn: false
  }
]

export const DEFAULT_CAPTION_PRESET_ID = 'classic'

// The presets a project offers: its own list when it has one, otherwise the shipped defaults.
export function captionPresetsOf(
  stored: readonly CaptionPreset[] | undefined
): readonly CaptionPreset[] {
  return stored && stored.length > 0 ? stored : DEFAULT_CAPTION_PRESETS
}

// The preset for a block: the block's own override, then the short's default, then the default preset,
// then the first preset in the list. An id that is not in the list falls through to the next choice.
export function resolveCaptionPreset(
  presets: readonly CaptionPreset[],
  shortPresetId: string | undefined,
  blockStyleId: string | undefined
): CaptionPreset {
  const find = (id: string | undefined): CaptionPreset | undefined =>
    id === undefined ? undefined : presets.find((preset) => preset.id === id)
  const chosen =
    find(blockStyleId) ?? find(shortPresetId) ?? find(DEFAULT_CAPTION_PRESET_ID) ?? presets[0]
  if (!chosen) throw new Error('A project needs at least one caption preset.')
  return chosen
}
