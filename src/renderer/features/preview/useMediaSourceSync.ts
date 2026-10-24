import { useEffect } from 'react'
import { useProjectStore } from '../project/useProjectStore'
import { mediaSourceStore } from './mediaSourceStore'

// Keeps the media source flags in step with the open project: refreshed when the project's media
// changes, and again when a proxy finishes, so playback switches to it without a reload.
export function useMediaSourceSync(): void {
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? null)
  const media = useProjectStore((state) => state.current?.project.media ?? null)

  useEffect(() => {
    if (folderPath === null || media === null) return undefined
    const refresh = () => void mediaSourceStore.getState().refresh(folderPath, media)
    refresh()
    return window.api.on('media:job:changed', (job) => {
      if (job.kind === 'proxy' && job.status === 'done') refresh()
    })
  }, [folderPath, media])
}
