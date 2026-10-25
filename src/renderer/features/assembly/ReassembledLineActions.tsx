// The optional steps offered after a script line is re-assembled (Epic 15, #142): make the line's narration
// (Epic 10, #114) and make captions from the short's cuts (Epic 11, #118). Each step runs the existing command
// when the user asks for it. Nothing runs on its own.
import { useState, type JSX } from 'react'
import { X } from 'lucide-react'
import { lineNarrationStates } from '@shared/narration/lineNarration'
import { Button } from '@renderer/ui/Button'
import { IconButton } from '@renderer/ui/IconButton'
import { generateShortCaptions } from '../captions/generateCaptions'
import { defaultVoiceId, generateLineNow } from '../narration/generateLineNow'
import { projectStore } from '../project/projectStore'
import { toast } from '../toasts/toast'
import styles from './ReassembledLineActions.module.css'

export interface ReassembledLineActionsProps {
  shortId: string
  scriptId: string
  lineId: string
  lineText: string
  // Zero-based position of the line, shown as Line n.
  lineIndex: number
  onDismiss: () => void
}

export function ReassembledLineActions({
  shortId,
  scriptId,
  lineId,
  lineText,
  lineIndex,
  onDismiss
}: ReassembledLineActionsProps): JSX.Element {
  const [narrating, setNarrating] = useState(false)

  async function makeNarration(): Promise<void> {
    const current = projectStore.getState().current
    if (!current) return
    const short = current.project.shorts.find((item) => item.id === shortId)
    const script = current.project.scripts.find((item) => item.id === scriptId)
    if (!short || !script) return
    setNarrating(true)
    const voiceId = await defaultVoiceId(current.folderPath)
    if (voiceId === null) {
      setNarrating(false)
      toast.info({
        title: 'Set a default voice first',
        description: 'Line narration uses the default voice from Settings.'
      })
      return
    }
    // A line that already has narration gets the new audio in its place.
    const state = lineNarrationStates(script.lines, short.timeline).find(
      (item) => item.lineId === lineId
    )
    await generateLineNow({
      shortId,
      scriptId,
      lineId,
      lineText,
      lineIndex,
      voiceId,
      regenerate: (state?.clipId ?? null) !== null
    })
    setNarrating(false)
  }

  return (
    <div className={styles.row} role="group" aria-label={`Next steps for line ${lineIndex + 1}`}>
      <span className={styles.label}>Line {lineIndex + 1} re-assembled</span>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          size="sm"
          loading={narrating}
          disabled={narrating || lineText.trim() === ''}
          onClick={() => void makeNarration()}
        >
          Make narration
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void generateShortCaptions(shortId, 'cut')}
        >
          Make captions
        </Button>
        <IconButton icon={X} label="Dismiss next steps" onClick={onDismiss} />
      </div>
    </div>
  )
}
