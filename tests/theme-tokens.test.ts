import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_BACKGROUND } from '@shared/theme'

const tokensCss = readFileSync(resolve(__dirname, '../src/renderer/theme/tokens.css'), 'utf8')

// Reads `--name: value;` declarations from the :root block.
function parseTokens(css: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    map.set(name, value.trim())
  }
  return map
}

const tokens = parseTokens(tokensCss)

// Resolves var(--x) chains down to a literal value.
function resolveToken(name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`Missing token --${name}`)
  const ref = value.match(/^var\(--([a-z0-9-]+)\)$/)
  return ref ? resolveToken(ref[1]) : value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme tokens', () => {
  // Text and surface pairs that real UI uses. Text must reach WCAG AA (4.5:1).
  const textPairs: Array<[string, string]> = [
    ['color-text', 'color-bg'],
    ['color-text', 'color-surface'],
    ['color-text', 'color-canvas'],
    ['color-text-2', 'color-bg'],
    ['color-text-2', 'color-surface'],
    ['color-primary', 'color-bg'],
    ['color-primary', 'color-surface'],
    ['color-ai', 'color-bg'],
    ['color-ai', 'color-surface'],
    ['color-success', 'color-bg'],
    ['color-editorial', 'color-bg'],
    ['color-editorial', 'color-canvas'],
    ['color-text-2', 'color-canvas'],
    ['color-on-primary', 'color-primary'],
    ['color-on-ai', 'color-ai'],
    ['color-on-destructive', 'color-destructive']
  ]

  it.each(textPairs)('--%s on --%s meets WCAG AA for text', (fg, bg) => {
    const ratio = contrast(resolveToken(fg), resolveToken(bg))
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  // Focus rings and other non-text indicators need 3:1 (WCAG 1.4.11).
  it('--color-focus on --color-surface meets the 3:1 non-text minimum', () => {
    const ratio = contrast(resolveToken('color-focus'), resolveToken('color-surface'))
    expect(ratio).toBeGreaterThanOrEqual(3)
  })

  it('motion durations fall in the 120–250ms range from DESIGN.md', () => {
    for (const name of ['duration-fast', 'duration-base', 'duration-slow']) {
      const ms = parseInt(resolveToken(name), 10)
      expect(ms).toBeGreaterThanOrEqual(120)
      expect(ms).toBeLessThanOrEqual(250)
    }
  })

  it('the window background in the main process matches --color-bg', () => {
    expect(APP_BACKGROUND.toLowerCase()).toBe(resolveToken('color-bg').toLowerCase())
  })
})
