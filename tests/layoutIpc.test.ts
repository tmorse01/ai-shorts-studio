import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import type { UiLayout } from '@shared/layout'

const layout: UiLayout = {
  leftTool: 'captions',
  panes: {
    left: { size: 340, collapsed: false },
    right: { size: 280, collapsed: true },
    bottom: { size: 200, collapsed: false }
  }
}

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'layout-test-')), 'ui-layout.json')
  const handlers = createIpcHandlers({ layoutFile: file })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { api, file }
}

describe('ui:layout:save and ui:layout:load', () => {
  it('returns the layout that was saved, including after a fresh start', async () => {
    const { api, file } = setup()
    expect(await api.invoke('ui:layout:save', { layout })).toEqual({
      ok: true,
      data: { saved: true }
    })

    // A second bridge over the same file stands in for a restart.
    const restarted = createBridge((channel, input) =>
      routeIpc(createIpcHandlers({ layoutFile: file }), channel, input)
    )
    expect(await restarted.invoke('ui:layout:load', {})).toEqual({
      ok: true,
      data: { layout }
    })
  })

  it('reports no saved layout when the file does not exist yet', async () => {
    const { api } = setup()
    expect(await api.invoke('ui:layout:load', {})).toEqual({ ok: true, data: { layout: null } })
  })

  it('treats a damaged layout file as no saved layout', async () => {
    const { api, file } = setup()
    writeFileSync(file, '{ not json', 'utf8')
    expect(await api.invoke('ui:layout:load', {})).toEqual({ ok: true, data: { layout: null } })
  })

  it('rejects an invalid layout before writing anything', async () => {
    const { api, file } = setup()
    const bad = { ...layout, leftTool: 'not-a-tool' }
    const result = await api.invoke('ui:layout:save', { layout: bad as UiLayout })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
    expect(existsSync(file)).toBe(false)
  })

  it('overwrites the previous layout on save', async () => {
    const { api, file } = setup()
    await api.invoke('ui:layout:save', { layout })
    await api.invoke('ui:layout:save', {
      layout: { ...layout, leftTool: 'media' }
    })
    expect(JSON.parse(readFileSync(file, 'utf8')).leftTool).toBe('media')
  })
})
