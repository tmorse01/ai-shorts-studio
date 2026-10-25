// The per-line narration list for a short's script (Epic 10, #114). Each line shows what narrates it, with
// Record, Generate and Regenerate. It reads the project's stores and writes only through undoable commands.
// It is not mounted in the editor here; the timeline work (#247) places it.
import { useEffect, useState, type JSX } from 'react'
import { lineNarrationStates } from '@shared/narration/lineNarration'
import { useProjectStore } from '../project/useProjectStore'
import { NarrationLineRow } from './NarrationLineRow'
import styles from './NarrationLinesPanel.module.css'

export interface NarrationLinesPanelProps {
  shortId: string
}

export function NarrationLinesPanel({ shortId }: NarrationLinesPanelProps): JSX.Element | null {
  const folderPath = useProjectStore((state) => state.current?.folderPath)
  const project = useProjectStore((state) => state.current?.project)
  const short = project?.shorts.find((item) => item.id === shortId)
  const script = project?.scripts.find((item) => item.id === short?.scriptId)
  const [voiceId, setVoiceId] = useState<string | null>(null)

  // The project's default voice. Without a key or a default the lines can still be recorded, so this only
  // gates Generate.
  const hasScript = script !== undefined
  useEffect(() => {
    if (!folderPath || !hasScript) return
    let current = true
    void window.api.invoke('tts:voices', { projectFolder: folderPath }).then((result) => {
      if (!current) return
      setVoiceId(result.ok ? result.data.defaultVoiceId : null)
    })
    return () => {
      current = false
    }
  }, [folderPath, hasScript])

  if (!short) return null
  if (!script) {
    return <p className={styles.empty}>Attach a script to this short to narrate its lines.</p>
  }

  const states = lineNarrationStates(script.lines, short.timeline)
  return (
    <ol className={styles.list}>
      {script.lines.map((line, index) => (
        <NarrationLineRow
          key={line.id}
          shortId={shortId}
          scriptId={script.id}
          line={line}
          state={states[index]}
          voiceId={voiceId}
        />
      ))}
    </ol>
  )
}
