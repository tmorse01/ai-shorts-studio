// The record panel for a voiceover take: microphone, input level, count-in, and Record and Stop. It reads
// the recorder's state and sends actions to it. The timeline keeps playing behind it while a take runs.
import type { JSX } from 'react'
import { useStore } from 'zustand'
import { COUNT_IN_OPTIONS_MS, type CountInMs } from '@shared/narration/take'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Select } from '@renderer/ui/Select'
import { formatTimecode } from '../playback/playbackClock'
import type { NarrationRecorder } from './narrationRecorder'
import styles from './RecordNarrationDialog.module.css'

const COUNT_IN_LABELS: Record<string, string> = {
  '0': 'No count-in',
  '2000': 'Count-in: 2 seconds',
  '4000': 'Count-in: 4 seconds'
}

export interface RecordNarrationDialogProps {
  recorder: NarrationRecorder
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecordNarrationDialog({
  recorder,
  open,
  onOpenChange
}: RecordNarrationDialogProps): JSX.Element {
  const take = useStore(recorder.store, (state) => state.take)
  const mics = useStore(recorder.store, (state) => state.mics)
  const micId = useStore(recorder.store, (state) => state.micId)
  const countInMs = useStore(recorder.store, (state) => state.countInMs)
  const level = useStore(recorder.store, (state) => state.level)

  const busy = take.status === 'countIn' || take.status === 'recording' || take.status === 'saving'
  const micOptions = mics.map((mic) => ({ value: mic.id, label: mic.label }))
  const countInOptions = COUNT_IN_OPTIONS_MS.map((ms) => ({
    value: String(ms),
    label: COUNT_IN_LABELS[String(ms)]
  }))

  let status = 'Ready. The take starts at the playhead.'
  if (take.status === 'countIn') {
    status = `Starting in ${Math.ceil(take.remainingMs / 1000)}`
  } else if (take.status === 'recording') {
    status = `Recording ${formatTimecode(take.elapsedMs)}`
  } else if (take.status === 'saving') {
    status = 'Saving the take'
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record narration"
      description="The timeline plays while you record. Use headphones so the timeline is not picked up by the microphone."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {busy && take.status !== 'saving' ? (
            <Button variant="secondary" onClick={() => void recorder.stop()}>
              {take.status === 'countIn' ? 'Cancel' : 'Stop'}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={take.status === 'saving'}
              onClick={() => void recorder.start()}
            >
              Record
            </Button>
          )}
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.label}>Microphone</span>
          <Select
            aria-label="Microphone"
            options={micOptions}
            value={micId ?? undefined}
            placeholder={mics.length === 0 ? 'No microphone found' : 'Choose a microphone'}
            disabled={busy || mics.length === 0}
            onValueChange={(value) => recorder.selectMic(value)}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Input level</span>
          <div
            className={styles.meter}
            role="meter"
            aria-label="Input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            <div className={styles.meterFill} style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Count-in</span>
          <Select
            aria-label="Count-in"
            options={countInOptions}
            value={String(countInMs)}
            disabled={busy}
            onValueChange={(value) => recorder.setCountIn(Number(value) as CountInMs)}
          />
        </div>
        <p className={styles.status} aria-live="polite">
          {status}
        </p>
        {take.status === 'error' ? (
          <p className={styles.error} role="alert">
            {take.message}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
