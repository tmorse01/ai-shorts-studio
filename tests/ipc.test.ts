import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createBridge, createEventBridge } from '../src/preload/bridge'
import { dispatchIpc, routeIpc, type IpcHandlers } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { setErrorLogSink } from '../src/main/errors/errorLog'
import type { IpcResult } from '@shared/ipc'

const ipcDir = mkdtempSync(join(tmpdir(), 'ipc-test-'))
const ipcHandlers = createIpcHandlers({
  layoutFile: join(ipcDir, 'ui-layout.json'),
  recentFile: join(ipcDir, 'recent-projects.json')
})

// The same path a real call takes, minus Electron: renderer -> bridge -> main router -> handler.
function makeBridge(handlers: IpcHandlers = ipcHandlers) {
  const rawInvoke = vi.fn((channel: string, input: unknown) => routeIpc(handlers, channel, input))
  return { api: createBridge(rawInvoke), rawInvoke }
}

describe('app:echo round trip', () => {
  it('accepts a valid request and returns the echoed, validated response', async () => {
    const { api } = makeBridge()
    const result = await api.invoke('app:echo', { text: '  hello  ' })
    expect(result).toEqual({ ok: true, data: { text: 'hello', length: 5 } })
  })

  it.each([
    ['an empty string', { text: '' }],
    ['only whitespace', { text: '   ' }],
    ['a number', { text: 42 }],
    ['a missing field', {}],
    ['text longer than 200 characters', { text: 'x'.repeat(201) }]
  ])('rejects %s as VALIDATION_FAILED', async (_label, input) => {
    const handler = vi.fn(({ text }: { text: string }) => ({ text, length: text.length }))
    const direct = await dispatchIpc('app:echo', input, handler)
    expect(direct.ok).toBe(false)
    expect(handler).not.toHaveBeenCalled()

    const { api } = makeBridge()
    const result = (await api.invoke('app:echo', input as { text: string })) as IpcResult<unknown>
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })

  it('returns a typed error, not a thrown string, when the handler throws', async () => {
    const { api } = makeBridge({
      ...ipcHandlers,
      'app:echo': () => {
        throw new Error('disk full')
      }
    })
    const result = await api.invoke('app:echo', { text: 'hi' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'HANDLER_FAILED', message: 'app:echo failed.', details: 'disk full' }
    })
  })

  it('flags a handler whose reply does not match the output schema', async () => {
    const { api } = makeBridge({
      ...ipcHandlers,
      'app:echo': () => ({ text: 'hi' }) as never
    })
    const result = await api.invoke('app:echo', { text: 'hi' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('HANDLER_FAILED')
  })

  it('refuses an unknown channel before anything crosses the bridge', async () => {
    const { api, rawInvoke } = makeBridge()
    const result = await api.invoke('app:nope' as 'app:echo', { text: 'hi' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_CHANNEL')
    expect(rawInvoke).not.toHaveBeenCalled()
  })

  it('turns a transport failure into a typed error', async () => {
    const api = createBridge(() => Promise.reject(new Error('ipc closed')))
    const result = await api.invoke('app:echo', { text: 'hi' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TRANSPORT_FAILED')
  })

  it('rejects a malformed reply from main as INVALID_RESPONSE', async () => {
    const api = createBridge(() => Promise.resolve({ unexpected: true }))
    const result = await api.invoke('app:echo', { text: 'hi' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_RESPONSE')
  })
})

describe('app:report-error round trip', () => {
  it('logs a renderer report in main and returns logged: true', async () => {
    const lines: string[] = []
    setErrorLogSink((text) => lines.push(text))
    try {
      const { api } = makeBridge()
      const result = await api.invoke('app:report-error', {
        message: 'TypeError: x is undefined',
        context: 'Demo pane',
        stack: 'TypeError: x is undefined\n    at Demo'
      })
      expect(result).toEqual({ ok: true, data: { logged: true } })
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('[renderer] (Demo pane) TypeError: x is undefined')
      expect(lines[0]).toContain('at Demo')
    } finally {
      setErrorLogSink((text) => console.error(text))
    }
  })

  it('rejects an empty report as VALIDATION_FAILED', async () => {
    const { api } = makeBridge()
    const result = await api.invoke('app:report-error', { message: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('main-to-renderer events', () => {
  const sample = {
    id: 'main-1',
    source: 'main' as const,
    message: 'The app hit an unexpected problem.',
    details: 'Error: boom',
    occurredAt: '2026-10-23T10:00:00.000Z'
  }

  // Captures the listener the bridge registers, so a test can play the part of main sending an event.
  function fakeTransport() {
    let emit: (raw: unknown) => void = () => undefined
    const unsubscribe = vi.fn()
    const on = createEventBridge((_channel, listener) => {
      emit = listener
      return unsubscribe
    })
    return { on, unsubscribe, emit: (raw: unknown) => emit(raw) }
  }

  it('passes a valid app:error payload to the listener', () => {
    const { on, emit } = fakeTransport()
    const received = vi.fn()
    on('app:error', received)
    emit(sample)
    expect(received).toHaveBeenCalledWith(sample)
  })

  it('drops a payload that fails the event schema', () => {
    const { on, emit } = fakeTransport()
    const received = vi.fn()
    on('app:error', received)
    emit({ ...sample, source: 'elsewhere' })
    expect(received).not.toHaveBeenCalled()
  })

  it('removes the transport listener on unsubscribe', () => {
    const { on, unsubscribe } = fakeTransport()
    const stop = on('app:error', () => undefined)
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
