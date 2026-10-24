// The open project and its save state. Every edit goes into the store and is autosaved. Switching
// projects or closing the window flushes pending changes first. The store is created by a factory so
// tests can pass a fake save; the app uses the default store, which saves through the IPC bridge.
// The DOM lib and the window.api declaration are pulled in here so this file can name `window.api`.
// Tests compile it under the node config, which has neither. The bridge is the only browser API used.
/// <reference lib="dom" />
import type {} from '../../api'
import { createStore } from 'zustand/vanilla'
import { produce, type Draft } from 'immer'
import type { Project } from '@shared/project/schema'
import { SaveError, createAutosaver, type SaveStatus } from './autosave'

export interface OpenProject {
  folderPath: string
  project: Project
}

export interface ProjectState {
  current: OpenProject | null
  saveStatus: SaveStatus
}

export interface ProjectActions {
  // Opens a project. Pending changes to the previous one are written first. Resolves false, and
  // keeps the previous project open, when that write fails.
  open: (opened: OpenProject) => Promise<boolean>
  // Applies an edit to the open project and schedules an autosave.
  edit: (recipe: (draft: Draft<Project>) => void) => void
  // Replaces the open project with a whole project object, such as the result of a command or an
  // undo, and schedules an autosave. The object is kept as given, so its identity can be compared.
  replaceProject: (project: Project) => void
  // Writes pending changes now.
  flush: () => Promise<void>
}

export type ProjectStore = ProjectState & ProjectActions

export function createProjectStore(saveOpened: (opened: OpenProject) => Promise<void>) {
  const autosaver = createAutosaver<OpenProject>({
    save: saveOpened,
    onStatus: (saveStatus) => store.setState({ saveStatus })
  })

  const store = createStore<ProjectStore>()((set, get) => ({
    current: null,
    saveStatus: { kind: 'saved', savedAt: undefined },

    open: async (opened) => {
      await autosaver.flush()
      if (get().saveStatus.kind === 'error') return false
      set({ current: opened, saveStatus: { kind: 'saved', savedAt: undefined } })
      return true
    },

    edit: (recipe) => {
      const { current } = get()
      if (!current) return
      const project = produce(current.project, (draft) => {
        recipe(draft)
        draft.updatedAt = new Date().toISOString()
      })
      const next = { folderPath: current.folderPath, project }
      set({ current: next })
      autosaver.schedule(next)
    },

    replaceProject: (project) => {
      const { current } = get()
      if (!current) return
      const next = { folderPath: current.folderPath, project }
      set({ current: next })
      autosaver.schedule(next)
    },

    flush: () => autosaver.flush()
  }))

  return store
}

// Writes through the typed IPC bridge. A refused write becomes a SaveError the toolbar can show.
async function saveOpenedProject({ folderPath, project }: OpenProject): Promise<void> {
  const result = await window.api.invoke('project:save', { folderPath, project })
  if (!result.ok) throw new SaveError(result.error.message, result.error.details)
}

export const projectStore = createProjectStore(saveOpenedProject)
