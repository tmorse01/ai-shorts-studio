import { describe, expect, it } from 'vitest'
import {
  createHistoryStore,
  DEFAULT_HISTORY_LIMIT,
  type Command
} from '@renderer/features/history/historyStore'

interface Doc {
  title: string
  start: number
  clips: { id: string; start: number }[]
}

const initial = (): Doc => ({
  title: 'Untitled',
  start: 0,
  clips: [{ id: 'a', start: 0 }]
})

function setStart(start: number, mergeKey?: string): Command<Doc> {
  return {
    label: 'Move clip',
    mergeKey,
    produce: (draft) => {
      draft.start = start
    }
  }
}

function rename(title: string): Command<Doc> {
  return {
    label: 'Rename',
    produce: (draft) => {
      draft.title = title
    }
  }
}

function clock(start = 0) {
  let time = start
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms
    }
  }
}

describe('history store: execute and undo/redo', () => {
  it('applies a command and records one undo step with its label', () => {
    const store = createHistoryStore(initial())
    expect(store.getState().execute(rename('Pilot'))).toBe(true)
    expect(store.getState().present.title).toBe('Pilot')
    expect(store.getState().past).toHaveLength(1)
    expect(store.getState().past[0].label).toBe('Rename')
  })

  it('records nothing when the producer changes nothing', () => {
    const store = createHistoryStore(initial())
    const noop: Command<Doc> = { label: 'Noop', produce: (draft) => (draft.start = 0) }
    expect(store.getState().execute(noop)).toBe(false)
    expect(store.getState().past).toHaveLength(0)
  })

  it('undo restores the previous state and redo reapplies the edit', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(rename('Pilot'))
    store.getState().execute(setStart(5))

    expect(store.getState().undo()).toBe(true)
    expect(store.getState().present).toEqual({ ...initial(), title: 'Pilot' })

    expect(store.getState().redo()).toBe(true)
    expect(store.getState().present).toEqual({ ...initial(), title: 'Pilot', start: 5 })
  })

  it('undo and redo report false when there is nothing to do', () => {
    const store = createHistoryStore(initial())
    expect(store.getState().undo()).toBe(false)
    expect(store.getState().redo()).toBe(false)
  })

  it('undoes a chain of structural edits back to the start', () => {
    const store = createHistoryStore(initial())
    const addClip: Command<Doc> = {
      label: 'Add clip',
      produce: (draft) => {
        draft.clips.push({ id: 'b', start: 3 })
      }
    }
    const removeFirst: Command<Doc> = {
      label: 'Remove clip',
      produce: (draft) => {
        draft.clips.splice(0, 1)
      }
    }
    store.getState().execute(addClip)
    store.getState().execute(removeFirst)
    store.getState().execute(rename('Pilot'))

    while (store.getState().undo()) {
      // keep undoing
    }
    expect(store.getState().present).toEqual(initial())

    while (store.getState().redo()) {
      // keep redoing
    }
    expect(store.getState().present).toEqual({
      title: 'Pilot',
      start: 0,
      clips: [{ id: 'b', start: 3 }]
    })
  })

  it('keeps earlier snapshots untouched', () => {
    const store = createHistoryStore(initial())
    const before = store.getState().present
    store.getState().execute(rename('Pilot'))
    expect(before.title).toBe('Untitled')
  })

  it('discards the redo stack after a new edit that follows an undo', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(rename('One'))
    store.getState().execute(rename('Two'))
    store.getState().undo()
    expect(store.getState().future).toHaveLength(1)

    store.getState().execute(rename('Three'))
    expect(store.getState().future).toHaveLength(0)
    expect(store.getState().redo()).toBe(false)
    expect(store.getState().present.title).toBe('Three')
  })

  it('a reset drops all history and keeps the new document', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(rename('Pilot'))
    store.getState().undo()
    store.getState().reset({ ...initial(), title: 'Loaded' })
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().future).toHaveLength(0)
    expect(store.getState().present.title).toBe('Loaded')
  })
})

describe('history store: limit', () => {
  it('defaults to 200 steps and drops the oldest first', () => {
    expect(DEFAULT_HISTORY_LIMIT).toBe(200)
    const store = createHistoryStore(initial())
    for (let i = 1; i <= 205; i++) store.getState().execute(setStart(i))

    expect(store.getState().limit).toBe(200)
    expect(store.getState().past).toHaveLength(200)
    while (store.getState().undo()) {
      // keep undoing
    }
    // Five oldest steps were dropped, so the earliest reachable state is start = 5.
    expect(store.getState().present.start).toBe(5)
  })

  it('accepts a configured limit', () => {
    const store = createHistoryStore(initial(), { limit: 2 })
    store.getState().execute(setStart(1))
    store.getState().execute(setStart(2))
    store.getState().execute(setStart(3))
    expect(store.getState().past).toHaveLength(2)
  })

  it('setLimit trims existing history to the new limit', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(setStart(1))
    store.getState().execute(setStart(2))
    store.getState().execute(setStart(3))
    store.getState().setLimit(1)
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().present.start).toBe(2)
  })

  it('rejects a limit that is not a non-negative integer', () => {
    expect(() => createHistoryStore(initial(), { limit: -1 })).toThrow(RangeError)
    expect(() => createHistoryStore(initial(), { limit: 1.5 })).toThrow(RangeError)
    const store = createHistoryStore(initial())
    expect(() => store.getState().setLimit(Number.NaN)).toThrow(RangeError)
  })
})

describe('history store: merging', () => {
  it('folds a drag of many commands into one undo step', () => {
    const time = clock()
    const store = createHistoryStore(initial(), { now: time.now })
    for (let x = 1; x <= 100; x++) {
      store.getState().execute(setStart(x, 'drag'))
      time.advance(16)
    }
    expect(store.getState().past).toHaveLength(1)

    store.getState().undo()
    expect(store.getState().present.start).toBe(0)
    store.getState().redo()
    expect(store.getState().present.start).toBe(100)
  })

  it('undoes merged changes to the same value in the right order', () => {
    const time = clock()
    const store = createHistoryStore(initial(), { now: time.now })
    store.getState().execute(setStart(1, 'drag'))
    time.advance(10)
    store.getState().execute(setStart(2, 'drag'))
    time.advance(10)
    store.getState().execute(setStart(3, 'drag'))

    store.getState().undo()
    expect(store.getState().present.start).toBe(0)
  })

  it('keeps separate entries when the gap exceeds the merge window', () => {
    const time = clock()
    const store = createHistoryStore(initial(), { now: time.now, mergeWindowMs: 500 })
    store.getState().execute(setStart(1, 'drag'))
    time.advance(501)
    store.getState().execute(setStart(2, 'drag'))
    expect(store.getState().past).toHaveLength(2)
  })

  it('does not merge commands with different keys', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(setStart(1, 'drag-a'))
    store.getState().execute(setStart(2, 'drag-b'))
    expect(store.getState().past).toHaveLength(2)
  })

  it('never merges commands without a key', () => {
    const store = createHistoryStore(initial())
    store.getState().execute(setStart(1))
    store.getState().execute(setStart(2))
    expect(store.getState().past).toHaveLength(2)
  })

  it('does not merge into an entry after an undo', () => {
    const time = clock()
    const store = createHistoryStore(initial(), { now: time.now })
    store.getState().execute(setStart(1, 'drag'))
    store.getState().undo()
    store.getState().execute(setStart(2, 'drag'))
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().present.start).toBe(0)
  })

  it('counts the merge window from the last command in the drag', () => {
    const time = clock()
    const store = createHistoryStore(initial(), { now: time.now, mergeWindowMs: 100 })
    store.getState().execute(setStart(1, 'drag'))
    time.advance(90)
    store.getState().execute(setStart(2, 'drag'))
    time.advance(90)
    store.getState().execute(setStart(3, 'drag'))
    expect(store.getState().past).toHaveLength(1)
  })
})

describe('history store: project-level history', () => {
  interface Project {
    shorts: { id: string; title: string }[]
  }

  it('undoes a project action such as deleting a short, without touching short histories', () => {
    const project = createHistoryStore<Project>({
      shorts: [
        { id: 's1', title: 'One' },
        { id: 's2', title: 'Two' }
      ]
    })
    const shortHistory = createHistoryStore(initial())
    shortHistory.getState().execute(rename('Edited'))

    project.getState().execute({
      label: 'Delete short',
      produce: (draft) => {
        draft.shorts = draft.shorts.filter((short) => short.id !== 's1')
      }
    })
    expect(project.getState().present.shorts).toHaveLength(1)

    project.getState().undo()
    expect(project.getState().present.shorts.map((short) => short.id)).toEqual(['s1', 's2'])
    expect(project.getState().past).toHaveLength(0)
    expect(shortHistory.getState().past).toHaveLength(1)
  })
})
