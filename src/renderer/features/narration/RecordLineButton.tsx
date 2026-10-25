// Records a voiceover take for one script line (Epic 10, #114). It is the line-level twin of the lane's Record
// control: the take plays from the line's position, and the finished take replaces that line's clip in one
// undoable command. The recorder and dialog are the ones from #108.
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { Button } from '@renderer/ui/Button'
import { toast } from '../toasts/toast'
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { playbackStore } from '../playback/playbackStore'
import { usePlaybackStore } from '../playback/usePlaybackStore'
import { browserMicDriver } from './browserMicDriver'
import { createNarrationRecorder, type TakeCommit } from './narrationRecorder'
import { RecordNarrationDialog } from './RecordNarrationDialog'
import { saveTakeWithIpc } from './narrationMedia'
import { lineClipCommand } from './lineNarrationCommands'

const TICK_MS = 50

function newId(): string {
  return crypto.randomUUID()
}

export interface RecordLineButtonProps {
  shortId: string
  scriptId: string
  lineId: string
  lineText: string
  // Where the line's clip starts on the timeline. The take plays from here.
  startMs: number
}

export function RecordLineButton({
  shortId,
  scriptId,
  lineId,
  lineText,
  startMs
}: RecordLineButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  // The recorder reads the start through this ref, so a line moving during a take does not orphan the mic.
  const startRef = useRef(startMs)
  useEffect(() => {
    startRef.current = startMs
  }, [startMs])

  const recorder = useMemo(
    () =>
      createNarrationRecorder({
        driver: browserMicDriver,
        playback: {
          getState: () => ({ ...playbackStore.getState(), playheadMs: startRef.current }),
          seek: (ms) => playbackStore.getState().seek(ms),
          play: () => playbackStore.getState().play(),
          pause: () => playbackStore.getState().pause()
        },
        commit: (take) => commitLineTake({ shortId, scriptId, lineId, lineText }, take)
      }),
    [shortId, scriptId, lineId, lineText]
  )
  const take = useStore(recorder.store, (state) => state.take)
  const playing = usePlaybackStore((state) => state.playing)

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

  useEffect(() => {
    recorder.transportChanged(playing)
  }, [playing, recorder])

  useEffect(() => () => recorder.dispose(), [recorder])

  function handleOpenChange(next: boolean) {
    if (next) void recorder.refreshMics()
    if (!next && take.status === 'recording') void recorder.stop()
    setOpen(next)
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => handleOpenChange(true)}>
        Record
      </Button>
      <RecordNarrationDialog recorder={recorder} open={open} onOpenChange={handleOpenChange} />
    </>
  )
}

interface LineTarget {
  shortId: string
  scriptId: string
  lineId: string
  lineText: string
}

// Saves the take's file, then replaces the line's clip with it as one undoable command.
async function commitLineTake(target: LineTarget, take: TakeCommit): Promise<void> {
  const folderPath = projectStore.getState().current?.folderPath
  if (!folderPath) throw new Error('Open a project before recording.')
  const saved = await saveTakeWithIpc(folderPath, take.bytes)
  applyProjectCommand(
    lineClipCommand({
      shortId: target.shortId,
      scriptId: target.scriptId,
      lineId: target.lineId,
      label: 'Record line narration',
      now: new Date().toISOString(),
      clipId: newId(),
      narrationTrackId: newId(),
      media: { ...saved, durationMs: take.durationMs, id: newId(), kind: 'audio' },
      durationMs: take.durationMs,
      source: 'recorded',
      text: target.lineText
    })
  )
  toast.success({ title: 'Line narration recorded', description: saved.fileName })
}
