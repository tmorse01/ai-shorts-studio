import { describe, expect, it } from 'vitest'
import { createProjectStore, type OpenProject } from '../src/renderer/features/project/projectStore'
import { resetEditorState } from '../src/renderer/features/project/resetEditorState'
import { editorHistory } from '../src/renderer/features/history/editorHistory'
import { layerSelectionStore } from '../src/renderer/features/compositor/layerSelectionStore'
import { sourceStore } from '../src/renderer/features/source/sourceStore'
import { SaveError } from '../src/renderer/features/project/autosave'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  type Project
} from '@shared/project/schema'

function projectNamed(id: string, name: string): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    media: [],
    mediaTags: [],
    moments: [],
    defaults: DEFAULT_SHORT_DEFAULTS,
    shorts: [],
    scripts: []
  }
}

describe('closing the open project', () => {
  it('writes pending changes, then leaves no project open', async () => {
    const written: OpenProject[] = []
    const store = createProjectStore(async (opened) => {
      written.push(opened)
    })
    await store.getState().open({ folderPath: 'C:/shoot', project: projectNamed('p1', 'Harbour') })
    store.getState().edit((draft) => {
      draft.name = 'Harbour v2'
    })

    expect(await store.getState().close()).toBe(true)
    expect(written.map((item) => item.project.name)).toEqual(['Harbour v2'])
    expect(store.getState().current).toBeNull()
  })

  it('keeps the project open when its changes cannot be saved', async () => {
    const store = createProjectStore(async () => {
      throw new SaveError('Disk full')
    })
    await store.getState().open({ folderPath: 'C:/shoot', project: projectNamed('p1', 'Harbour') })
    store.getState().edit((draft) => {
      draft.name = 'Harbour v2'
    })

    expect(await store.getState().close()).toBe(false)
    expect(store.getState().current?.project.name).toBe('Harbour v2')
  })
})

describe('resetEditorState', () => {
  it('drops every short undo history and the active short', () => {
    editorHistory.get('short-a')
    editorHistory.get('short-b')
    editorHistory.selection.getState().setActive('short-a')

    resetEditorState()

    expect(editorHistory.ids()).toEqual([])
    expect(editorHistory.selection.getState().activeId).toBeNull()
  })

  it('clears the clip selection and returns the source view to the short', () => {
    layerSelectionStore.getState().select('clip-1')
    sourceStore.getState().openSource('media-1')

    resetEditorState()

    expect(layerSelectionStore.getState().selectedClipId).toBeNull()
    expect(sourceStore.getState()).toMatchObject({ mode: 'short', sourceId: null })
  })
})
