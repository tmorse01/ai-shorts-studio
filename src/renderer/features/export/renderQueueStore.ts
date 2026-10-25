// The render queue for the export panel (Epic 17, #152): the exports main is running or has finished,
// and the actions that start, cancel and reveal them. Main owns the queue; this store holds its latest list.
import { createStore } from 'zustand'
import type { RenderJob } from '@shared/export/renderQueue'
import type { IpcError } from '@shared/ipc'
import { toast } from '../toasts/toast'

export interface RenderQueueStore {
  jobs: RenderJob[]
  setJobs: (jobs: RenderJob[]) => void
  refresh: () => Promise<void>
  /** Queues an export for each short. Resolves false, after a toast, when main refuses. */
  start: (projectFolder: string, shortIds: string[]) => Promise<boolean>
  cancel: (jobId: string) => Promise<void>
  reveal: (jobId: string) => Promise<void>
}

function failed(error: IpcError): void {
  toast.error({ title: error.message, details: error.details })
}

export const renderQueueStore = createStore<RenderQueueStore>()((set) => ({
  jobs: [],
  setJobs: (jobs) => set({ jobs }),
  refresh: async () => {
    const result = await window.api.invoke('export:queue:list', {})
    if (result.ok) set({ jobs: result.data.jobs })
    else failed(result.error)
  },
  start: async (projectFolder, shortIds) => {
    const result = await window.api.invoke('export:start', { projectFolder, shortIds })
    if (!result.ok) {
      failed(result.error)
      return false
    }
    set({ jobs: result.data.jobs })
    return true
  },
  cancel: async (jobId) => {
    const result = await window.api.invoke('export:cancel', { jobId })
    if (!result.ok) failed(result.error)
  },
  reveal: async (jobId) => {
    const result = await window.api.invoke('export:reveal', { jobId })
    if (!result.ok) failed(result.error)
  }
}))
