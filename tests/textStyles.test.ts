import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEXT_FONT_STACKS, TEXT_PALETTE, TEXT_STYLES } from '@shared/text/textStyles'

const tokens = readFileSync(join(process.cwd(), 'src/renderer/theme/tokens.css'), 'utf8')

function tokenValue(name: string): string {
  const match = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`token --${name} is missing`)
  return match[1].trim()
}

describe('text style tokens', () => {
  it('mirrors the font stacks in tokens.css', () => {
    expect(TEXT_FONT_STACKS.display).toBe(tokenValue('font-display'))
    expect(TEXT_FONT_STACKS.heading).toBe(tokenValue('font-heading'))
    expect(TEXT_FONT_STACKS.ui).toBe(tokenValue('font-ui'))
  })

  it('mirrors the palette colours in tokens.css', () => {
    expect(TEXT_PALETTE.void).toBe(tokenValue('color-void-black'))
    expect(TEXT_PALETTE.white).toBe(tokenValue('color-galactic-white'))
    expect(TEXT_PALETTE.ivory).toBe(tokenValue('color-aged-ivory'))
    expect(TEXT_PALETTE.sage).toBe(tokenValue('color-undead-sage'))
  })

  it('uses only font roles and palette colours that exist', () => {
    for (const style of Object.values(TEXT_STYLES)) {
      expect(TEXT_FONT_STACKS[style.font]).toBeTruthy()
      expect(TEXT_PALETTE[style.fill]).toBeTruthy()
      if (style.stroke) expect(TEXT_PALETTE[style.stroke.color]).toBeTruthy()
    }
  })
})
