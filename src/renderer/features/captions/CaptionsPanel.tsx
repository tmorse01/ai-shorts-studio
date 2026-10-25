// The Captions panel: generate captions for the open short from its narration or its cuts. Generating
// again replaces the captions in the same range. Each generate is one undo step.
import { useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { Button } from '@renderer/ui/Button'
import { editorHistory } from '../history/editorHistory'
import { generateShortCaptions, type CaptionSource } from './generateCaptions'
import { exportShortSrt } from './exportSrt'
import styles from './CaptionsPanel.module.css'

export function CaptionsPanel(): JSX.Element {
  const activeId = useStore(editorHistory.selection, (state) => state.activeId)
  const [busy, setBusy] = useState<CaptionSource | null>(null)

  async function run(source: CaptionSource): Promise<void> {
    if (!activeId || busy) return
    setBusy(source)
    try {
      await generateShortCaptions(activeId, source)
    } finally {
      setBusy(null)
    }
  }

  if (!activeId) {
    return <p className={styles.note}>Open a short to generate its captions.</p>
  }

  return (
    <div className={styles.panel}>
      <p className={styles.note}>
        Captions follow the clips' timing. Generating again replaces the captions in the same range.
      </p>
      <Button
        variant="primary"
        loading={busy === 'narration'}
        disabled={busy !== null}
        onClick={() => void run('narration')}
      >
        Caption narration
      </Button>
      <Button loading={busy === 'cut'} disabled={busy !== null} onClick={() => void run('cut')}>
        Caption cuts
      </Button>
      <Button onClick={() => void exportShortSrt(activeId)}>Export SRT</Button>
    </div>
  )
}
