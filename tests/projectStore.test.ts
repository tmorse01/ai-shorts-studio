import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DELAY_MS, SaveError } from '../src/renderer/features/project/autosave'
import { createProjectStore, type OpenProject } from '../src/renderer/features/project/projectStore'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project
} from '@shared/project/schema'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function projectNamed(id: string, name: string): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    defaults: DEFAULT_SHORT_DEFAULTS,
    shorts: [],
    scripts: []
  }
}

function setup(save: (opened: OpenProject) => Promise<void> = () => Promise.resolve()) {
  const written: OpenProject[] = []
  const store = createProjectStore(async (opened) => {
    written.push(opened)
    await save(opened)
  })
  return { store, written }
}

describe('projectStore', () => {
  it('autosaves a burst of edits as one write, with the edit applied', async () => {
    const { store, written } = setup()
    await store.getState().open({ folderPath: 'C:/shoot', project: projectNamed('p1', 'Harbour') })

    store.getState().edit((draft) => {
      draft.name = 'Harbour v2'
    })
    store.getState().edit((draft) => {
      draft.name = 'Harbour v3'
    })
    expect(written).toEqual([])

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(written).toHaveLength(1)
    expect(written[0]?.folderPath).toBe('C:/shoot')
    expect(written[0]?.project.name).toBe('Harbour v3')
    expect(store.getState().saveStatus.kind).toBe('saved')
  })

  it('writes pending changes to the old project before switching to another', async () => {
    const { store, written } = setup()
    await store.getState().open({ folderPath: 'C:/one', project: projectNamed('p1', 'One') })
    store.getState().edit((draft) => {
      draft.name = 'One, edited'
    })

    const switched = await store.getState().open({
      folderPath: 'C:/two',
      project: projectNamed('p2', 'Two')
    })

    expect(switched).toBe(true)
    expect(written.map((opened) => opened.project.name)).toEqual(['One, edited'])
    expect(store.getState().current?.folderPath).toBe('C:/two')
  })

  it('keeps the current project open when the switch cannot save its changes', async () => {
    let fail = true
    const { store } = setup(async () => {
      if (fail) throw new SaveError('The project folder is read-only.')
    })
    await store.getState().open({ folderPath: 'C:/one', project: projectNamed('p1', 'One') })
    store.getState().edit((draft) => {
      draft.name = 'One, edited'
    })

    const switched = await store.getState().open({
      folderPath: 'C:/two',
      project: projectNamed('p2', 'Two')
    })

    expect(switched).toBe(false)
    expect(store.getState().current?.folderPath).toBe('C:/one')
    expect(store.getState().saveStatus).toMatchObject({
      kind: 'error',
      message: 'The project folder is read-only.'
    })

    fail = false
    expect(
      await store.getState().open({ folderPath: 'C:/two', project: projectNamed('p2', 'Two') })
    ).toBe(true)
  })

  it('bumps updatedAt on every edit', async () => {
    const { store } = setup()
    await store.getState().open({ folderPath: 'C:/shoot', project: projectNamed('p1', 'Harbour') })
    vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'))

    store.getState().edit((draft) => {
      draft.name = 'Harbour v2'
    })

    expect(store.getState().current?.project.updatedAt).toBe('2026-10-23T10:00:00.000Z')
  })

  it('ignores edits when no project is open', () => {
    const { store, written } = setup()

    store.getState().edit((draft) => {
      draft.name = 'Nothing open'
    })

    expect(store.getState().current).toBeNull()
    expect(written).toEqual([])
  })
})
