import { useState, type JSX } from 'react'
import type { Script } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { useProjectStore } from '../project/useProjectStore'
import { NewScriptDialog } from './NewScriptDialog'
import { ScriptEditor } from './ScriptEditor'
import { estimatedReadSeconds, formatReadTime, scriptWordCount } from './scriptStats'
import styles from './ScriptsSection.module.css'

const NO_SCRIPTS: Script[] = []

// The Scripts section of Project home: one row per script with its line count, word count and read
// time. Opening a row shows the script editor.
export function ScriptsSection(): JSX.Element {
  const scripts = useProjectStore((state) => state.current?.project.scripts ?? NO_SCRIPTS)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section aria-label="Scripts" className={styles.section}>
      <div className={styles.toolbar}>
        <h2 className={styles.heading}>Scripts</h2>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New script
        </Button>
      </div>

      {scripts.length === 0 ? (
        <EmptyState title="No scripts yet" description="Write a script, then cut shorts from it." />
      ) : (
        <ul className={styles.list}>
          {scripts.map((script) => {
            const words = scriptWordCount(script)
            const read = formatReadTime(estimatedReadSeconds(words))
            return (
              <li key={script.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => setEditingId(script.id)}
                >
                  <span className={styles.title}>{script.title}</span>
                  {script.topic && <span className={styles.topic}>{script.topic}</span>}
                  <span className={styles.meta}>
                    {script.lines.length} {script.lines.length === 1 ? 'line' : 'lines'} · {words}{' '}
                    {words === 1 ? 'word' : 'words'} · about {read} read
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <NewScriptDialog open={creating} onOpenChange={setCreating} onCreated={setEditingId} />
      <ScriptEditor scriptId={editingId} onOpenChange={(open) => !open && setEditingId(null)} />
    </section>
  )
}
