import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appErrorSchema,
  createAppError,
  describeError,
  UNEXPECTED_ERROR_MESSAGES
} from '@shared/errors'
import { formatErrorLogEntry, setErrorLogSink } from '../src/main/errors/errorLog'
import { createMainErrorHandler } from '../src/main/errors/mainErrors'

const when = new Date('2026-10-23T10:00:00.000Z')

afterEach(() => {
  setErrorLogSink((text) => console.error(text))
})

describe('describeError', () => {
  it('gives the error name and message, with no stack trace', () => {
    const error = new TypeError('x is undefined')
    const text = describeError(error)
    expect(text).toBe('TypeError: x is undefined')
    expect(text).not.toContain('at ')
  })

  it('handles strings and non-error values', () => {
    expect(describeError('disk full')).toBe('disk full')
    expect(describeError({ code: 7 })).toBe('Non-error value: {"code":7}')
    expect(describeError(undefined)).toBe('Non-error value: undefined')
  })

  it('caps a very long detail', () => {
    expect(describeError(new Error('x'.repeat(5000))).length).toBeLessThanOrEqual(2000)
  })
})

describe('createAppError', () => {
  it('builds a report that matches the app:error schema', () => {
    const report = createAppError('main', new Error('boom'), { id: 'main-1', occurredAt: when })
    expect(appErrorSchema.safeParse(report).success).toBe(true)
    expect(report).toEqual({
      id: 'main-1',
      source: 'main',
      message: UNEXPECTED_ERROR_MESSAGES.main,
      details: 'Error: boom',
      occurredAt: '2026-10-23T10:00:00.000Z'
    })
  })

  it('uses a plain-language headline for renderer errors', () => {
    const report = createAppError('renderer', 'nope', { id: 'r-1', occurredAt: when })
    expect(report.message).toBe('Part of the screen hit an unexpected problem.')
    expect(report.details).toBe('nope')
  })
})

describe('formatErrorLogEntry', () => {
  it('writes the summary on one line, then the stack for developers', () => {
    const text = formatErrorLogEntry({
      occurredAt: '2026-10-23T10:00:00.000Z',
      source: 'renderer',
      context: 'Media pane',
      summary: 'TypeError: x is undefined',
      stack: 'TypeError: x is undefined\n    at Media'
    })
    expect(text.split('\n')[0]).toBe(
      '2026-10-23T10:00:00.000Z [renderer] (Media pane) TypeError: x is undefined'
    )
    expect(text).toContain('at Media')
  })
})

describe('main error handler', () => {
  it('logs the stack, notifies once, and returns the report', () => {
    const lines: string[] = []
    setErrorLogSink((text) => lines.push(text))
    const notify = vi.fn()
    const handle = createMainErrorHandler({
      notify,
      now: () => when,
      newId: () => 'main-7'
    })

    const error = new Error('disk gone')
    const report = handle(error)

    expect(report.id).toBe('main-7')
    expect(report.details).toBe('Error: disk gone')
    expect(notify).toHaveBeenCalledWith(report)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('[main] Error: disk gone')
    expect(lines[0]).toContain(error.stack ?? '')
    // The toast detail has no stack. The stack only reaches the log.
    expect(report.details).not.toContain('\n')
  })

  it('still reports a rejection whose reason is not an Error', () => {
    const notify = vi.fn()
    const handle = createMainErrorHandler({ notify, now: () => when, newId: () => 'main-8' })
    handle('just a string')
    expect(notify.mock.calls[0]?.[0]).toMatchObject({ details: 'just a string' })
  })
})
