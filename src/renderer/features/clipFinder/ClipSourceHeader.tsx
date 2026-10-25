// The header above the Clip Finder list for the selected video: its thumbnail, name, duration, resolution and
// size, and the Find moments and Reanalyze actions. The resolution comes from a probe, read once per file.
import { useEffect, useState, type JSX } from 'react'
import { Sparkles } from 'lucide-react'
import { formatBytes } from '@shared/export/exportSettings'
import type { ProbeVideo } from '@shared/media/probe'
import { thumbFileName } from '@shared/media/thumbs'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { formatDuration } from '../media/mediaView'
import { useThumb } from '../timeline/useThumb'
import { resolutionLabel } from './clipFinderModel'
import styles from './ClipSourceHeader.module.css'

// Probe results by absolute path, so switching between files does not probe them again.
const probed = new Map<string, ProbeVideo | null>()

export interface ClipSourceHeaderProps {
  folderPath: string
  source: MediaRef
  busy: boolean
  onFind: () => void
  onReanalyze: () => void
}

export function ClipSourceHeader({
  folderPath,
  source,
  busy,
  onFind,
  onReanalyze
}: ClipSourceHeaderProps): JSX.Element {
  const thumb = useThumb(folderPath, source.id, thumbFileName(source.kind))
  const absolutePath = source.pathKind === 'absolute' ? source.path : `${folderPath}/${source.path}`
  const video = useVideoProbe(absolutePath)
  const facts = [
    source.durationMs === undefined ? undefined : formatDuration(source.durationMs),
    video ? resolutionLabel(video) : undefined,
    formatBytes(source.sizeBytes)
  ].filter((fact): fact is string => fact !== undefined)

  return (
    <header className={styles.header}>
      <span className={styles.thumb}>
        {thumb ? <img src={thumb.src} alt="" className={styles.image} /> : null}
      </span>
      <span className={styles.info}>
        <span className={styles.name} title={source.fileName}>
          <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />
          {source.fileName}
        </span>
        <span className={styles.meta}>{facts.join(' · ')}</span>
      </span>
      <span className={styles.actions}>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onFind}>
          Find moments
        </Button>
        <Button variant="ghost" size="sm" onClick={onReanalyze}>
          Reanalyze
        </Button>
      </span>
    </header>
  )
}

// Reads the first video stream's size. Null when the file has no video or cannot be probed.
function useVideoProbe(absolutePath: string): ProbeVideo | null | undefined {
  const [video, setVideo] = useState<ProbeVideo | null | undefined>(() => probed.get(absolutePath))

  useEffect(() => {
    const cached = probed.get(absolutePath)
    if (cached !== undefined) return
    let live = true
    window.api
      .invoke('media:probe', { path: absolutePath })
      .then((result) => {
        const found = result.ok ? result.data.video : null
        probed.set(absolutePath, found)
        if (live) setVideo(found)
      })
      .catch(() => {
        probed.set(absolutePath, null)
      })
    return () => {
      live = false
    }
  }, [absolutePath])

  return video
}
