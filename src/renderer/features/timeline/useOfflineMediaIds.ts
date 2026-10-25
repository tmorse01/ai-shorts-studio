import { useEffect, useState } from 'react'
import type { MediaRef } from '@shared/project/schema'
import { absoluteMediaPath, offlineMediaIds } from './editorTimelineModel'

// The ids of the project's media whose files are not on disk. Checked again when the media list or
// the project folder changes. A failed check leaves every item marked online.
export function useOfflineMediaIds(
  folderPath: string,
  media: readonly MediaRef[] | undefined
): readonly string[] {
  const [offline, setOffline] = useState<readonly string[]>([])

  useEffect(() => {
    if (!media || media.length === 0) {
      setOffline([])
      return
    }
    let cancelled = false
    const paths = media.map((ref) => absoluteMediaPath(folderPath, ref))
    void window.api.invoke('media:stat', { paths }).then((result) => {
      if (cancelled || !result.ok) return
      setOffline(offlineMediaIds(folderPath, media, result.data.missing))
    })
    return () => {
      cancelled = true
    }
  }, [folderPath, media])

  return offline
}
