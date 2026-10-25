import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fitWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type WindowState
} from '@shared/windowState'
import {
  readWindowStateFile,
  writeWindowStateFile,
  writeWindowStateSync
} from '../src/main/windowStateFile'

// One 1920x1080 screen with the taskbar taking 40px at the bottom.
const screen = { x: 0, y: 0, width: 1920, height: 1040 }

const saved: WindowState = {
  bounds: { x: 200, y: 120, width: 1500, height: 900 },
  maximized: false
}

describe('fitWindowState', () => {
  it('keeps a saved position that is on screen', () => {
    expect(fitWindowState(saved, [screen])).toEqual(saved)
  })

  it('keeps the maximised flag so the window reopens maximised', () => {
    const maximized = { ...saved, maximized: true }
    expect(fitWindowState(maximized, [screen])?.maximized).toBe(true)
  })

  it('raises a saved size below the editor minimum', () => {
    const small = { bounds: { x: 0, y: 0, width: 800, height: 500 }, maximized: false }
    expect(fitWindowState(small, [screen])?.bounds).toEqual({
      x: 0,
      y: 0,
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT
    })
  })

  it('drops a position on a monitor that is no longer connected', () => {
    const offScreen = { bounds: { x: 4000, y: 100, width: 1400, height: 800 }, maximized: false }
    expect(fitWindowState(offScreen, [screen])).toBeNull()
  })

  it('reuses a position that is on a second monitor when that monitor is present', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1040 }
    const onSecond = { bounds: { x: 2100, y: 100, width: 1400, height: 800 }, maximized: false }
    expect(fitWindowState(onSecond, [screen, second])).toEqual(onSecond)
  })

  it('returns null when nothing was saved', () => {
    expect(fitWindowState(null, [screen])).toBeNull()
  })
})

describe('window state file', () => {
  function tempFile(): string {
    return join(mkdtempSync(join(tmpdir(), 'window-state-test-')), 'window-state.json')
  }

  it('reads back the bounds and maximised state that were written', async () => {
    const file = tempFile()
    await writeWindowStateFile(file, saved)
    expect(await readWindowStateFile(file)).toEqual(saved)
  })

  it('writes synchronously on close and reads back the same state', async () => {
    const file = tempFile()
    const maximized = { ...saved, maximized: true }
    writeWindowStateSync(file, maximized)
    expect(await readWindowStateFile(file)).toEqual(maximized)
  })

  it('treats a missing file as no saved state', async () => {
    expect(await readWindowStateFile(tempFile())).toBeNull()
  })

  it('treats a damaged file as no saved state', async () => {
    const file = tempFile()
    writeFileSync(file, '{ not json')
    expect(await readWindowStateFile(file)).toBeNull()
  })

  it('treats a file with invalid bounds as no saved state', async () => {
    const file = tempFile()
    writeFileSync(
      file,
      JSON.stringify({ bounds: { x: 0, y: 0, width: 0, height: 720 }, maximized: false })
    )
    expect(await readWindowStateFile(file)).toBeNull()
  })
})
