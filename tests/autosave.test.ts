import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_DELAY_MS,
  SaveError,
  createAutosaver,
  type SaveStatus
} from '../src/renderer/features/project/autosave'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(save: (value: string) => Promise<void> = () => Promise.resolve()) {
  const statuses: SaveStatus[] = []
  const saved: string[] = []
  const autosaver = createAutosaver<string>({
    save: async (value) => {
      saved.push(value)
      await save(value)
    },
    onStatus: (status) => statuses.push(status)
  })
  return { autosaver, statuses, saved }
}

describe('createAutosaver', () => {
  it('writes once, with the latest value, after a burst of edits', async () => {
    const { autosaver, saved, statuses } = setup()

    autosaver.schedule('a')
    autosaver.schedule('ab')
    autosaver.schedule('abc')
    expect(saved).toEqual([])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(saved).toEqual(['abc'])
    expect(statuses.at(-1)).toMatchObject({ kind: 'saved' })
  })

  it('restarts the debounce on each change', async () => {
    const { autosaver, saved } = setup()

    autosaver.schedule('a')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    autosaver.schedule('b')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    expect(saved).toEqual([])

    await vi.advanceTimersByTimeAsync(100)
    expect(saved).toEqual(['b'])
  })

  it('flush saves a pending change at once, and the timer does not write it again', async () => {
    const { autosaver, saved } = setup()

    autosaver.schedule('closing')
    await autosaver.flush()
    expect(saved).toEqual(['closing'])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(saved).toEqual(['closing'])
  })

  it('reports a failed write and keeps the value so flush retries it', async () => {
    let fail = true
    const { autosaver, saved, statuses } = setup(async () => {
      if (fail) throw new SaveError('Disk is full.', 'ENOSPC')
    })

    autosaver.schedule('draft')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(statuses.at(-1)).toEqual({ kind: 'error', message: 'Disk is full.', details: 'ENOSPC' })

    fail = false
    await autosaver.flush()
    expect(saved).toEqual(['draft', 'draft'])
    expect(statuses.at(-1)).toMatchObject({ kind: 'saved' })
  })

  it('describes an unexpected failure in plain language', async () => {
    const { autosaver, statuses } = setup(() => Promise.reject(new Error('boom')))

    autosaver.schedule('draft')
    await autosaver.flush()
    expect(statuses.at(-1)).toEqual({
      kind: 'error',
      message: 'Your latest changes could not be saved.',
      details: 'boom'
    })
  })

  it('saves a change made during a write after the debounce, not straight away', async () => {
    let release: () => void = () => undefined
    const { autosaver, saved } = setup(() => new Promise<void>((resolve) => (release = resolve)))

    autosaver.schedule('first')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(saved).toEqual(['first'])

    autosaver.schedule('second')
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(saved).toEqual(['first'])

    release = () => undefined
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(saved).toEqual(['first', 'second'])
  })
})
