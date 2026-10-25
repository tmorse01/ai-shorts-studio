import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { DEFAULT_EXPORT_SETTINGS, type EncoderInfo } from '@shared/export/exportSettings'

const encoder: EncoderInfo = {
  encoder: 'libx264',
  hardware: false,
  fallback: true,
  ffmpegVersion: '6.1',
  amixNormalizeSupported: true
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'export-ipc-'))
}

function setup(exportSettingsFile?: string) {
  const dir = tempDir()
  const handlers = createIpcHandlers({
    layoutFile: join(dir, 'layout.json'),
    recentFile: join(dir, 'recent.json'),
    exportSettingsFile,
    exportEncoder: () => encoder
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

describe('export:state:get and export:settings:save', () => {
  it('reports the encoder and no saved settings on a first run', async () => {
    const api = setup(join(tempDir(), 'export-settings.json'))
    expect(await api.invoke('export:state:get', {})).toEqual({
      ok: true,
      data: { encoder, settings: null }
    })
  })

  it('returns the settings that were saved, including after a restart', async () => {
    const file = join(tempDir(), 'export-settings.json')
    const settings = { ...DEFAULT_EXPORT_SETTINGS, presetId: 'reels' as const, fps: 25 as const }
    const api = setup(file)
    expect(await api.invoke('export:settings:save', { settings })).toEqual({
      ok: true,
      data: { saved: true }
    })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(settings)

    const restarted = setup(file)
    expect(await restarted.invoke('export:state:get', {})).toEqual({
      ok: true,
      data: { encoder, settings }
    })
  })

  it('treats a damaged settings file as no saved settings', async () => {
    const file = join(tempDir(), 'export-settings.json')
    writeFileSync(file, '{ not json', 'utf8')
    const api = setup(file)
    expect(await api.invoke('export:state:get', {})).toEqual({
      ok: true,
      data: { encoder, settings: null }
    })
  })

  it('rejects settings that break the schema before writing anything', async () => {
    const file = join(tempDir(), 'export-settings.json')
    const api = setup(file)
    const result = await api.invoke('export:settings:save', {
      settings: { ...DEFAULT_EXPORT_SETTINGS, fps: 12 as never }
    })
    expect(result.ok).toBe(false)
    expect(await api.invoke('export:state:get', {})).toEqual({
      ok: true,
      data: { encoder, settings: null }
    })
  })
})
