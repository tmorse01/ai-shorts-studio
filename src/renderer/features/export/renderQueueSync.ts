// Keeps the render queue list and the open project current from main's events. Main records each finished
// export in the project file itself, so the renderer only has to show the new list and mark the short here.
import type { RendererApi, Unsubscribe } from '@shared/ipc'
import { renderQueueStore } from './renderQueueStore'

export interface ShortExportTarget {
  getState: () => {
    applyShortExported: (folderPath: string, shortId: string, exportedAt: string) => void
  }
}

export function watchRenderQueue(
  api: Pick<RendererApi, 'on'>,
  project: ShortExportTarget
): Unsubscribe {
  const stopQueue = api.on('export:queue:changed', ({ jobs }) => {
    renderQueueStore.getState().setJobs(jobs)
  })
  const stopExported = api.on('export:shortExported', ({ projectFolder, shortId, exportedAt }) => {
    project.getState().applyShortExported(projectFolder, shortId, exportedAt)
  })
  return () => {
    stopQueue()
    stopExported()
  }
}
