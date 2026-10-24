import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Components style themselves only through tokens. A raw colour in a component stylesheet would
// bypass the theme, so this test fails if one appears. The tokens file itself is exempt.
const dirs = [
  resolve(__dirname, '../src/renderer/ui'),
  resolve(__dirname, '../src/renderer/routes'),
  resolve(__dirname, '../src/renderer'),
  resolve(__dirname, '../src/renderer/features/toasts'),
  resolve(__dirname, '../src/renderer/features/errors')
]

const styleFiles = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.module.css'))
    .map((name) => resolve(dir, name))
)

const rawColour = /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/i

describe('component stylesheets', () => {
  it('finds the component stylesheets', () => {
    expect(styleFiles.length).toBeGreaterThanOrEqual(10)
  })

  it.each(styleFiles.map((file) => [file.split(/[\\/]/).pop(), file]))(
    '%s uses no hard-coded colours',
    (_name, file) => {
      const css = readFileSync(file as string, 'utf8')
      expect(css.match(rawColour)).toBeNull()
    }
  )
})
