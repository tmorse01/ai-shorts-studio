// What the preview knows about each media item's files: whether it is online and whether a proxy is
// ready. Filled from main through media:sources; the paths themselves never reach the renderer.
import type {} from '../../api'
import { createStore } from 'zustand/vanilla'
import type { MediaRef } from '@shared/project/schema'
import type { MediaSourceInfo } from '@shared/media/mediaSources'
import { toast } from '../toasts/toast'

export interface MediaSourceState {
  byId: Record<string, MediaSourceInfo>
}

export interface MediaSourceActions {
  refresh: (projectFolder: string, media: readonly MediaRef[]) => Promise<void>
}

export type MediaSourceStore = MediaSourceState & MediaSourceActions

export const mediaSourceStore = createStore<MediaSourceStore>()((set) => ({
  byId: {},
  refresh: async (projectFolder, media) => {
    const result = await window.api.invoke('media:sources', {
      projectFolder,
      media: media.map((ref) => ({ id: ref.id, path: ref.path, pathKind: ref.pathKind }))
    })
    if (!result.ok) {
      toast.error({
        title: 'Could not check the media files',
        description: result.error.message,
        details: result.error.details
      })
      return
    }
    const byId: Record<string, MediaSourceInfo> = {}
    for (const source of result.data.sources) byId[source.id] = source
    set({ byId })
  }
}))
