import { useEffect, useState, type JSX } from 'react'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { pickFolder } from '../dashboard/projectActions'
import { toast } from '../toasts/toast'
import { projectStore } from './projectStore'
import { useProjectStore } from './useProjectStore'
import styles from './OfflineBanner.module.css'

// The absolute path of a media file, as the main process checks it.
function absolutePath(folderPath: string, ref: MediaRef): string {
  if (ref.pathKind === 'absolute') return ref.path
  return `${folderPath}/${ref.path}`
}

// Shows when footage the project uses is no longer on disk, with a way to point at a new folder.
export function OfflineBanner(): JSX.Element | null {
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? '')
  const media = useProjectStore((state) => state.current?.project.media)
  const [offline, setOffline] = useState(0)

  useEffect(() => {
    if (!media || media.length === 0) {
      setOffline(0)
      return
    }
    let cancelled = false
    const paths = media.map((ref) => absolutePath(folderPath, ref))
    void window.api.invoke('media:stat', { paths }).then((result) => {
      if (cancelled || !result.ok) return
      setOffline(result.data.missing.length)
    })
    return () => {
      cancelled = true
    }
  }, [folderPath, media])

  if (offline === 0) return null

  async function relink() {
    const searchFolder = await pickFolder()
    if (!searchFolder) return
    const result = await window.api.invoke('project:relinkFolder', { folderPath, searchFolder })
    if (!result.ok) {
      toast.error({ title: 'Could not relink footage', description: result.error.message })
      return
    }
    const { relinkedCount, unmatchedFileNames } = result.data
    await projectStore
      .getState()
      .open({ folderPath: result.data.folderPath, project: result.data.project })
    toast.info({
      title: `Relinked ${relinkedCount} ${relinkedCount === 1 ? 'file' : 'files'}`,
      description:
        unmatchedFileNames.length > 0 ? `Not found: ${unmatchedFileNames.join(', ')}` : undefined
    })
  }

  return (
    <div role="status" className={styles.banner}>
      <span>
        {offline} {offline === 1 ? 'file is' : 'files are'} offline.
      </span>
      <Button variant="secondary" size="sm" onClick={() => void relink()}>
        Relink folder…
      </Button>
    </div>
  )
}
