// One script line in the per-line narration list (Epic 10, #114): its text, what narrates it, and the Record,
// Generate and Regenerate controls for that line.
import { useState, type JSX } from 'react'
import type { ScriptLine } from '@shared/project/schema'
import type { LineNarrationState } from '@shared/narration/lineNarration'
import { lineNarrationLabel } from '@shared/narration/lineNarration'
import { speechTextSchema } from '@shared/tts/speech'
import { Button } from '@renderer/ui/Button'
import { generateLineNow } from './generateLineNow'
import { RecordLineButton } from './RecordLineButton'
import styles from './NarrationLineRow.module.css'

const PREVIEW_CHARS = 120

export interface NarrationLineRowProps {
  shortId: string
  scriptId: string
  line: ScriptLine
  state: LineNarrationState
  // The project's default voice for generated lines. Null when none is set.
  voiceId: string | null
}

export function NarrationLineRow({
  shortId,
  scriptId,
  line,
  state,
  voiceId
}: NarrationLineRowProps): JSX.Element {
  const [busy, setBusy] = useState(false)
  const hasClip = state.clipId !== null
  const textOk = speechTextSchema.safeParse(line.text).success
  const canGenerate = textOk && voiceId !== null && !busy

  let hint: string | null = null
  if (!textOk) hint = 'Add some text to this line to generate it.'
  else if (voiceId === null) hint = 'Set a default voice to generate this line.'

  async function generate() {
    if (!voiceId) return
    setBusy(true)
    await generateLineNow({
      shortId,
      scriptId,
      lineId: line.id,
      lineText: line.text,
      lineIndex: state.index,
      voiceId,
      regenerate: hasClip
    })
    setBusy(false)
  }

  return (
    <li className={styles.row}>
      <div className={styles.head}>
        <span className={styles.index}>{state.index + 1}</span>
        <span className={styles.status} data-status={state.status}>
          {lineNarrationLabel(state.status)}
        </span>
      </div>
      <p className={styles.text}>{preview(line.text)}</p>
      <div className={styles.actions}>
        <RecordLineButton
          shortId={shortId}
          scriptId={scriptId}
          lineId={line.id}
          lineText={line.text}
          startMs={state.startMs}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          {busy ? 'Making' : hasClip ? 'Regenerate' : 'Generate'}
        </Button>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </li>
  )
}

function preview(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'No text'
  return trimmed.length > PREVIEW_CHARS
    ? `${trimmed.slice(0, PREVIEW_CHARS).trimEnd()}...`
    : trimmed
}
