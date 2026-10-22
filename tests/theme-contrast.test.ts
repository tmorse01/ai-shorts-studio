import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Reads the hex tokens from tokens.css, so the test checks the same values the app ships. */
function readTokens(): Record<string, string> {
  const css = readFileSync(join(__dirname, '../src/renderer/theme/tokens.css'), 'utf8')
  const tokens: Record<string, string> = {}
  for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2].toLowerCase()
  return tokens
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const t = readTokens()
const surfaces = ['ink-0', 'surface-0', 'surface-1', 'surface-2']

describe('brand tokens', () => {
  it('defines every colour the components rely on', () => {
    for (const name of ['ink-0', 'surface-0', 'surface-1', 'surface-2', 'text', 'text-2', 'primary', 'primary-ink', 'primary-on', 'danger']) {
      expect(t[name], name).toBeDefined()
    }
  })

  it.each(surfaces)('primary text is readable on %s (4.5:1)', (s) => {
    expect(contrast(t['text'], t[s])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(surfaces)('secondary text is readable on %s (4.5:1)', (s) => {
    expect(contrast(t['text-2'], t[s])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['primary', 'primary-hover'])('button label on %s is readable (4.5:1)', (fill) => {
    expect(contrast(t['primary-on'], t[fill])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['primary-ink', 'secondary', 'success', 'warning', 'danger', 'info'])('%s accent text is readable on surface-1 (4.5:1)', (name) => {
    expect(contrast(t[name], t['surface-1'])).toBeGreaterThanOrEqual(4.5)
  })
})
