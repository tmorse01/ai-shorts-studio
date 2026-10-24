import { describe, expect, it, vi } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { dispatchIpc, routeIpc, type IpcHandlers } from '../src/main/ipc/dispatch'
import { ipcHandlers } from '../src/main/ipc/handlers'
import type { IpcResult } from '@shared/ipc'

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
