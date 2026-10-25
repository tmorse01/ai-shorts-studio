// Drafts scripts with AI in two steps: the brief (topic, count, length, tone, notes), then the cost
// estimate with the footage it would use. Only after the user confirms are the drafts sent, and they are
// saved as new scripts in one undoable step.
import { useState, type FormEvent, type JSX } from 'react'
import { formatUsd, VISION_MODEL_LABELS } from '@shared/ai/aiSettings'
import {
  estimateScriptSeconds,
  SCRIPT_MAX_COUNT,
  type ScriptEstimate,
  type ScriptRequest,
  type ScriptRunInput
} from '@shared/ai/scriptGeneration'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Input } from '@renderer/ui/Input'
import { Switch } from '@renderer/ui/Switch'
import { applyProjectCommand } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { useProjectStore } from '../project/useProjectStore'
import { createScriptsCommand } from './scriptCommands'
import { draftScripts, estimateScriptDrafts, scriptsFromDrafts } from './scriptDrafts'
import styles from './GenerateScriptsDialog.module.css'

export interface GenerateScriptsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerateScriptsDialog({
  open,
  onOpenChange
}: GenerateScriptsDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Draft scripts with AI"
      description="Claude drafts scripts from your brief and your footage's transcripts and shot descriptions. Video is never sent."
    >
      {open && <GenerateForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

interface Estimated {
  input: ScriptRunInput
  estimate: ScriptEstimate
}

function GenerateForm({ onDone }: { onDone: () => void }): JSX.Element {
  const current = useProjectStore((state) => state.current)
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState('3')
  const [seconds, setSeconds] = useState('')
  const [tone, setTone] = useState('')
  const [notes, setNotes] = useState('')
  const [reuseFootage, setReuseFootage] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estimated, setEstimated] = useState<Estimated | null>(null)
  const [busy, setBusy] = useState(false)

  function brief(): ScriptRequest | string {
    if (topic.trim() === '') return 'Say what the scripts are about.'
    const countValue = Number(count)
    if (!Number.isInteger(countValue) || countValue < 1 || countValue > SCRIPT_MAX_COUNT) {
      return `Choose between 1 and ${SCRIPT_MAX_COUNT} scripts.`
    }
    let targetSeconds: number | null = null
    if (seconds.trim() !== '') {
      const value = Number(seconds)
      if (!Number.isInteger(value) || value < 5 || value > 900) {
        return 'The target length is between 5 and 900 seconds.'
      }
      targetSeconds = value
    }
    return { topic, count: countValue, targetSeconds, tone, notes, reuseFootage }
  }

  async function review(event: FormEvent) {
    event.preventDefault()
    if (!current || busy) return
    const request = brief()
    if (typeof request === 'string') {
      setError(request)
      return
    }
    const input: ScriptRunInput = {
      projectFolder: current.folderPath,
      media: current.project.media.map((item) => ({ id: item.id, fileName: item.fileName })),
      request: {
        ...request,
        topic: request.topic.trim(),
        tone: request.tone.trim(),
        notes: request.notes.trim()
      }
    }
    setBusy(true)
    const estimate = await estimateScriptDrafts(window.api, input)
    setBusy(false)
    if (estimate) setEstimated({ input, estimate })
  }

  async function draft() {
    if (!estimated || busy) return
    setBusy(true)
    const drafts = await draftScripts(window.api, estimated.input)
    setBusy(false)
    if (!drafts) return
    applyProjectCommand(createScriptsCommand(scriptsFromDrafts(drafts)))
    toast.ai({
      title: drafts.length === 1 ? 'Drafted 1 script' : `Drafted ${drafts.length} scripts`,
      description: 'They are in the Scripts list. Undo removes them.'
    })
    onDone()
  }

  if (estimated) {
    const { estimate } = estimated
    const capped = estimate.capStatus === 'reached'
    return (
      <div className={styles.form}>
        <p className={styles.text}>
          {`Estimated cost: ${formatUsd(estimate.estimateUsd)} with ${VISION_MODEL_LABELS[estimate.model]}. ${
            estimate.remainingUsd === null
              ? 'No monthly cap is set.'
              : `${formatUsd(estimate.remainingUsd)} is left under this month's cap.`
          }`}
        </p>
        <p className={styles.text}>
          {`Estimated time: about ${estimateScriptSeconds(estimated.input.request.count)} seconds.`}
        </p>
        <p className={styles.note}>
          Grounded in {estimate.transcriptUsed}{' '}
          {estimate.transcriptUsed === 1 ? 'transcript excerpt' : 'transcript excerpts'} and{' '}
          {estimate.shotsUsed} {estimate.shotsUsed === 1 ? 'shot description' : 'shot descriptions'}
          . The estimate is a planning figure. The real cost is counted from the reply's token
          counts.
        </p>
        {capped && (
          <p role="alert" className={styles.error}>
            This month's AI spend cap is reached. Raise the cap in Settings to draft scripts.
          </p>
        )}
        <div className={styles.footer}>
          <Button variant="ghost" onClick={() => setEstimated(null)} disabled={busy}>
            Back
          </Button>
          <Button variant="ai" onClick={() => void draft()} loading={busy} disabled={capped}>
            {`Draft ${estimated.input.request.count} ${
              estimated.input.request.count === 1 ? 'script' : 'scripts'
            }`}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(event) => void review(event)} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Topic</span>
        <Input
          value={topic}
          maxLength={240}
          autoFocus
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setTopic(event.target.value)
            setError(null)
          }}
        />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Scripts</span>
          <Input
            type="number"
            min={1}
            max={SCRIPT_MAX_COUNT}
            step={1}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Target seconds</span>
          <Input
            type="number"
            min={5}
            max={900}
            step={1}
            placeholder="Any"
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Tone</span>
        <Input value={tone} maxLength={80} onChange={(event) => setTone(event.target.value)} />
      </label>
      <Switch checked={reuseFootage} onCheckedChange={setReuseFootage}>
        Allow the same footage in more than one script
      </Switch>
      <label className={styles.field}>
        <span className={styles.label}>Notes</span>
        <textarea
          className={styles.textarea}
          value={notes}
          maxLength={2000}
          rows={4}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.footer}>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!current}>
          Review cost
        </Button>
      </div>
    </form>
  )
}
