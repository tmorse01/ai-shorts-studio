import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatch, type Batch } from '@shared/batch/batch'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project
} from '@shared/project/schema'
import { watchBatches, type BatchEvents } from '../src/renderer/features/batch/batchSync'
import { AUTOSAVE_DELAY_MS } from '../src/renderer/features/project/autosave'
import { createProjectStore, type OpenProject } from '../src/renderer/features/project/projectStore'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const FOLDER = '/projects/river'

function batch(id: string, status: 'queued' | 'done' = 'queued'): Batch {
  const built = createBatch({
    id,
    stage: 'transcript',
    mediaIds: ['clip1'],
    createdAt: '2026-10-24T09:00:00.000Z'
  })
  return status === 'queued'
    ? built
    : {
        ...built,
        status: 'done',
        items: built.items.map((item) => ({ ...item, status: 'done', progress: 1 }))
      }
}

function projectWith(batches: Batch[] | undefined): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'river',
    name: 'River',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    mediaTags: [],
    moments: [],
    defaults: DEFAULT_SHORT_DEFAULTS,
    shorts: [],
    scripts: [],
    ...(batches === undefined ? {} : { batches })
  }
}

function setup() {
  const written: OpenProject[] = []
  const store = createProjectStore(async (opened) => {
    written.push(opened)
  })
  let listener: ((payload: { projectFolder: string; batch: Batch }) => void) | undefined
  const api: BatchEvents = {
    on: (_channel, handler) => {
      listener = handler
      return () => {
        listener = undefined
      }
    }
  }
  const fire = (projectFolder: string, next: Batch) => listener?.({ projectFolder, batch: next })
  return { store, written, api, fire }
}

describe('batches in the open project', () => {
  it('keeps the batches it loaded through an edit and the save that follows', async () => {
    const { store, written } = setup()
    await store.getState().open({ folderPath: FOLDER, project: projectWith([batch('batch-a')]) })
    store.getState().edit((draft) => {
      draft.name = 'Renamed'
    })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(written.at(-1)?.project.batches?.map((item) => item.id)).toEqual(['batch-a'])
  })

  it('replaces a batch that main reports, without scheduling a save', async () => {
    const { store, written, api, fire } = setup()
    await store.getState().open({ folderPath: FOLDER, project: projectWith([batch('batch-a')]) })
    watchBatches(api, store)

    fire(FOLDER, batch('batch-a', 'done'))
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(store.getState().current?.project.batches?.[0]?.status).toBe('done')
    expect(written).toHaveLength(0)
  })

  it('adds a batch that is new to the open project', async () => {
    const { store, api, fire } = setup()
    await store.getState().open({ folderPath: FOLDER, project: projectWith(undefined) })
    watchBatches(api, store)

    fire(FOLDER, batch('batch-b'))

    expect(store.getState().current?.project.batches?.map((item) => item.id)).toEqual(['batch-b'])
  })

  it('ignores a batch from a project that is not open', async () => {
    const { store, api, fire } = setup()
    await store.getState().open({ folderPath: FOLDER, project: projectWith([batch('batch-a')]) })
    watchBatches(api, store)

    fire('/projects/other', batch('batch-z'))

    expect(store.getState().current?.project.batches?.map((item) => item.id)).toEqual(['batch-a'])
  })
})
