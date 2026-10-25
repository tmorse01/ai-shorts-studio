// The text overlay style catalogue (Epic 13, #126). Pure data shared by main, the renderer and export.
// Font stacks and palette values mirror the tokens in src/renderer/theme/tokens.css. The app cannot read
// that file here, so tests/textStyles.test.ts keeps the two in step.
import { z } from 'zod'

export const textFontRoleSchema = z.enum(['display', 'heading', 'ui'])
export type TextFontRole = z.infer<typeof textFontRoleSchema>

// The same stacks as --font-display, --font-heading and --font-ui. Fonts are bundled in
// src/renderer/theme/fonts.ts.
export const TEXT_FONT_STACKS: Record<TextFontRole, string> = {
  display: "'Cormorant Garamond', Georgia, serif",
  heading: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  ui: "'Inter Variable', system-ui, sans-serif"
}

// Colours a text style may use, by DESIGN.md palette name. Values match the --color-* tokens.
export const TEXT_PALETTE = {
  void: '#050606',
  white: '#f5f5f0',
  ivory: '#f0e8d5',
  sage: '#c4dca5'
} as const
export type TextColorName = keyof typeof TEXT_PALETTE
export const TEXT_COLOR_NAMES = Object.keys(TEXT_PALETTE) as [TextColorName, ...TextColorName[]]
export const textColorNameSchema = z.enum(TEXT_COLOR_NAMES)

export interface TextStyle {
  label: string
  font: TextFontRole
  weight: number
  // Font size in canvas pixels (the canvas is 1080 by 1920).
  sizePx: number
  uppercase: boolean
  letterSpacingPx: number
  fill: TextColorName
  stroke?: { color: TextColorName; widthPx: number }
}

export const TEXT_STYLE_IDS = ['display', 'heading', 'caption', 'label'] as const
export const textStyleIdSchema = z.enum(TEXT_STYLE_IDS)
export type TextStyleId = z.infer<typeof textStyleIdSchema>

export const TEXT_STYLES: Record<TextStyleId, TextStyle> = {
  display: {
    label: 'Display',
    font: 'display',
    weight: 600,
    sizePx: 120,
    uppercase: false,
    letterSpacingPx: 0,
    fill: 'ivory'
  },
  heading: {
    label: 'Heading',
    font: 'heading',
    weight: 600,
    sizePx: 104,
    uppercase: true,
    letterSpacingPx: 6,
    fill: 'white'
  },
  caption: {
    label: 'Caption',
    font: 'ui',
    weight: 600,
    sizePx: 64,
    uppercase: false,
    letterSpacingPx: 0,
    fill: 'white',
    stroke: { color: 'void', widthPx: 10 }
  },
  label: {
    label: 'Label',
    font: 'heading',
    weight: 500,
    sizePx: 72,
    uppercase: true,
    letterSpacingPx: 4,
    fill: 'sage'
  }
}
