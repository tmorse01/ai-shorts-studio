import type { JSX } from 'react'
import { useParams } from '@tanstack/react-router'
import { ImagePlus } from 'lucide-react'
import { Button } from '@renderer/ui/Button'
import { playbackStore } from '../playback/playbackStore'
import { projectStore } from '../project/projectStore'
import { toast } from '../toasts/toast'
import { applyProjectCommand } from './shortActions'
import { setShortPosterCommand } from './shortCommands'
import { queueShortPoster } from './posterRequests'

// Editor control: makes the frame under the playhead the short's poster. Undo brings back the old
// poster frame through the project history.
export function SetPosterButton(): JSX.Element | null {
  const { shortId } = useParams({ strict: false })
  if (!shortId) return null

  const setPoster = () => {
    const posterMs = Math.round(playbackStore.getState().playheadMs)
    applyProjectCommand(setShortPosterCommand(shortId, posterMs, new Date().toISOString()))
    // Queue the frame now, so its job runs even when no Export panel or grid is showing the short. The
    // poster view then reloads when the job is done.
    const current = projectStore.getState().current
    const short = current?.project.shorts.find((item) => item.id === shortId)
    if (current && short) {
      void queueShortPoster(
        (projectFolder, items) => window.api.invoke('media:posters', { projectFolder, items }),
        current.folderPath,
        short,
        current.project.media
      )
    }
    toast.info({ title: 'Poster frame set' })
  }

  return (
    <Button variant="secondary" size="sm" onClick={setPoster}>
      <ImagePlus size={14} strokeWidth={1.75} aria-hidden="true" />
      Set as poster
    </Button>
  )
}
