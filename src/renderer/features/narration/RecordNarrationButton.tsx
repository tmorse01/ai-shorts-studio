// The Record narration control on the Narration lane (Epic 10, #108). It owns one recorder for the short,
// ticks the take's clock, follows the timeline's play state, and saves a finished take as an undoable
// command. Opening the panel refreshes the microphone list.
import { useEffect, useMemo, useState, type JSX } from 'react'
import { Mic } from 'lucide-react'
import { useStore } from 'zustand'
import type { MediaRef } from '@shared/project/schema'
import { narrationTakeClip } from '@shared/narration/take'
import { IconButton } from '@renderer/ui/IconButton'
import { toast } from '../toasts/toast'
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { browserMicDriver } from './browserMicDriver'
import { addNarrationTakeCommand } from './narrationTakeCommands'
import { createNarrationRecorder, type TakeCommit } from './narrationRecorder'
import { RecordNarrationDialog } from './RecordNarrationDialog'

const TICK_MS = 50

function newId(): string {
  return crypto.randomUUID()
}

// Saves the take's file in the project's media folder, then adds its footage and narration clip as one
// undoable command on the short.
async function commitTake(shortId: string, take: TakeCommit): Promise<void> {
  const folderPath = projectStore.getState().current?.folderPath
  if (!folderPath) throw new Error('Open a project before recording.')
  const saved = await window.api.invoke('narration:take:save', {
    projectFolder: folderPath,
    bytes: take.bytes
  })
  if (!saved.ok) throw new Error(saved.error.message)
  const mediaId = newId()
  const media: MediaRef = {
    id: mediaId,
    path: saved.data.path,
    pathKind: saved.data.pathKind,
    fileName: saved.data.fileName,
    sizeBytes: saved.data.sizeBytes,
    durationMs: take.durationMs,
    kind: 'audio'
  }
  const clip = narrationTakeClip({
    clipId: newId(),
    mediaId,
    startMs: take.startMs,
    durationMs: take.durationMs
  })
  applyProjectCommand(
    addNarrationTakeCommand({
      shortId,
      label: 'Record narration',
      now: new Date().toISOString(),
      media,
      clip,
      narrationTrackId: newId()
    })
  )
  toast.success({ title: 'Narration take added', description: media.fileName })
}

export interface RecordNarrationButtonProps {
  shortId: string
}

export function RecordNarrationButton({ shortId }: RecordNarrationButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const recorder = useMemo(
    () =>
      createNarrationRecorder({
        driver: browserMicDriver,
        playback: {
          getState: () => playbackStore.getState(),
          seek: (ms) => playbackStore.getState().seek(ms),
          play: () => playbackStore.getState().play(),
          pause: () => playbackStore.getState().pause()
        },
        commit: (take) => commitTake(shortId, take)
      }),
    [shortId]
  )
  const take = useStore(recorder.store, (state) => state.take)
  const playing = usePlaybackStore((state) => state.playing)

  // Ticks the take's clock and samples the level while a take is active or the panel is open.
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      recorder.tick(now - last)
      recorder.sampleLevel()
      last = now
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [recorder])

  // The timeline reaching its end or being paused ends the take.
  useEffect(() => {
    recorder.transportChanged(playing)
  }, [playing, recorder])

  // Releases the mic if the lane goes away mid-take.
  useEffect(() => () => recorder.dispose(), [recorder])

  function handleOpenChange(next: boolean) {
    if (next) void recorder.refreshMics()
    if (!next && take.status === 'recording') void recorder.stop()
    setOpen(next)
  }

  return (
    <>
      <IconButton
        icon={Mic}
        label="Record narration"
        aria-pressed={take.status === 'recording'}
        onClick={() => handleOpenChange(true)}
      />
      <RecordNarrationDialog recorder={recorder} open={open} onOpenChange={handleOpenChange} />
    </>
  )
}
