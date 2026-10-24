import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, AUTO_DISMISS_MS } from '@renderer/features/toasts/toast'
import { toastStore } from '@renderer/features/toasts/toastStore'
import {
  handleRendererError,
  installRendererErrorHandlers,
  toastInputForAppError
} from '@renderer/features/toasts/globalErrors'
import { UNEXPECTED_ERROR_HINT } from '@shared/errors'

beforeEach(() => {
  toastStore.setState({ toasts: [] })
})

afterEach(() => {
  toastStore.setState({ toasts: [] })
})

function onlyToast() {
  const { toasts } = toastStore.getState()
  expect(toasts).toHaveLength(1)
  return toasts[0]
}

describe('toast service', () => {
  it.each([
    ['info', 'info'],
    ['success', 'success'],
    ['ai', 'ai']
  ] as const)('%s toast is auto-dismissed after the default delay', (method, tone) => {
    toast[method]({ title: 'Done' })
    expect(onlyToast()).toMatchObject({ tone, title: 'Done', dismissAfterMs: AUTO_DISMISS_MS })
  })

  it('error toasts never auto-dismiss', () => {
    toast.error({ title: 'Export failed', details: 'ENOSPC' })
    expect(onlyToast()).toMatchObject({
      tone: 'error',
      title: 'Export failed',
      details: 'ENOSPC',
      dismissAfterMs: null
    })
  })

  it('gives every toast a unique id and keeps them in order', () => {
    const first = toast.info({ title: 'One' })
    const second = toast.error({ title: 'Two' })
    expect(first).not.toBe(second)
    expect(toastStore.getState().toasts.map((item) => item.title)).toEqual(['One', 'Two'])
  })

  it('dismisses one toast by id and leaves the others', () => {
    const first = toast.info({ title: 'One' })
    toast.info({ title: 'Two' })
    toast.dismiss(first)
    expect(toastStore.getState().toasts.map((item) => item.title)).toEqual(['Two'])
  })

  it('can be called outside React, with plain data', () => {
    expect(() => toast.success({ title: 'Saved' })).not.toThrow()
    expect(toastStore.getState().toasts).toHaveLength(1)
  })
})

describe('renderer error handling', () => {
  const when = new Date('2026-10-23T10:00:00.000Z')

  it('turns an uncaught error into an error toast and reports it', () => {
    const notify = vi.fn()
    const report = vi.fn()
    const error = new RangeError('index 9 out of range')
    handleRendererError(error, { notify, report, newId: () => 'r-1', now: () => when })

    expect(report).toHaveBeenCalledWith(error)
    expect(notify).toHaveBeenCalledWith({
      title: 'Part of the screen hit an unexpected problem.',
      description: UNEXPECTED_ERROR_HINT,
      details: 'RangeError: index 9 out of range'
    })
  })

  it('maps a main-process app error to a toast with its detail', () => {
    expect(
      toastInputForAppError({
        id: 'main-1',
        source: 'main',
        message: 'The app hit an unexpected problem.',
        details: 'Error: boom',
        occurredAt: when.toISOString()
      })
    ).toEqual({
      title: 'The app hit an unexpected problem.',
      description: UNEXPECTED_ERROR_HINT,
      details: 'Error: boom'
    })
  })

  it('shows a toast for a window error event and for an unhandled rejection', () => {
    const target = new EventTarget()
    const notify = vi.fn()
    const report = vi.fn()
    const stop = installRendererErrorHandlers(target, {
      notify,
      report,
      newId: () => 'r-2',
      now: () => when
    })

    const errorEvent = Object.assign(new Event('error'), { error: new Error('render blew up') })
    target.dispatchEvent(errorEvent)
    const rejection = Object.assign(new Event('unhandledrejection'), {
      reason: new Error('fetch failed')
    })
    target.dispatchEvent(rejection)

    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ details: 'Error: render blew up' })
    expect(notify.mock.calls[1]?.[0]).toMatchObject({ details: 'Error: fetch failed' })
    expect(report).toHaveBeenCalledTimes(2)

    stop()
    target.dispatchEvent(Object.assign(new Event('error'), { error: new Error('after stop') }))
    expect(notify).toHaveBeenCalledTimes(2)
  })
})
