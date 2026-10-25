// No pane scrolls sideways (CLAUDE.md, Styling). The rule lives in CSS, so these checks read the
// stylesheets that set it and fail if a pane, the media grid or the tile loses it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(__dirname, '..', path), 'utf8')

// The body of the first rule whose selector is exactly `selector`.
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('no horizontal overflow in panes', () => {
  it('a pane body hides sideways overflow and scrolls only vertically', () => {
    const body = ruleBody(read('src/renderer/features/layout/PaneFrame.module.css'), '.body')
    expect(body).toMatch(/overflow-x:\s*hidden/)
    expect(body).toMatch(/overflow-y:\s*auto/)
  })

  it('the media grid and list never scroll sideways, and tiles share one width token', () => {
    const css = read('src/renderer/features/media/MediaPanel.module.css')
    expect(ruleBody(css, '.grid')).toMatch(/minmax\(var\(--media-tile-w\),\s*1fr\)/)
    expect(ruleBody(css, '.grid')).toMatch(/overflow-x:\s*hidden/)
    expect(ruleBody(css, '.list')).toMatch(/overflow-x:\s*hidden/)
  })

  it('the tile name truncates with an ellipsis instead of wrapping', () => {
    const css = read('src/renderer/features/media/MediaTile.module.css')
    // Whitespace-tolerant: the checkout may use CRLF or LF line endings.
    const match = /\.name,\s*\.tags\s*\{([^}]*)\}/.exec(css)
    expect(match, '.name, .tags rule exists').not.toBeNull()
    const name = match?.[1] ?? ''
    expect(name).toMatch(/text-overflow:\s*ellipsis/)
    expect(name).toMatch(/white-space:\s*nowrap/)
  })

  it('scrollbars take their colours from tokens', () => {
    const css = read('src/renderer/theme/base.css')
    expect(css).toMatch(/scrollbar-color:\s*var\(--scrollbar-thumb\)/)
    expect(read('src/renderer/theme/tokens.css')).toMatch(/--scrollbar-track:/)
  })
})
