import { useState, type JSX } from 'react'
import type { Script } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { useProjectStore } from '../project/useProjectStore'
import { Switch } from '@renderer/ui/Switch'
import { assemblyStatusLabel } from '../assembly/assemblyQueue'
import { startAssemblyBatch, useAssemblyQueueStore } from '../assembly/assemblyQueueStore'
import { GenerateScriptsDialog } from './GenerateScriptsDialog'
import { NewScriptDialog } from './NewScriptDialog'
import { ScriptEditor } from './ScriptEditor'
import { estimatedReadSeconds, formatReadTime, scriptWordCount } from './scriptStats'
import styles from './ScriptsSection.module.css'

const NO_SCRIPTS: Script[] = []

// The Scripts section of Project home: one row per script with its line count, word count and read
// time. Opening a row shows the script editor.
export function ScriptsSection(): JSX.Element {
  const scripts = useProjectStore((state) => state.current?.project.scripts ?? NO_SCRIPTS)
  const plans = useAssemblyQueueStore((state) => state.plans)
  const [creating, setCreating] = useState(false)
  const [drafting, setDrafting] = useState(false)
  // Off by default: a script's footage avoids cuts the earlier scripts in the same batch already use.
  const [reuseFootage, setReuseFootage] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const approvedIds = scripts.filter((script) => script.approval === 'approved').map((s) => s.id)

  // Starts one batch that matches footage for every approved script. Nothing reaches a short until its plan
  // is reviewed and applied in the script's review panel.
  function assembleApproved() {
    void startAssemblyBatch(approvedIds, reuseFootage)
  }

  return (
    <section aria-label="Scripts" className={styles.section}>
      <div className={styles.toolbar}>
        <h2 className={styles.heading}>Scripts</h2>
        <div className={styles.actions}>
          <Switch checked={reuseFootage} onCheckedChange={setReuseFootage}>
            Reuse footage
          </Switch>
          <Button
            variant="secondary"
            disabled={approvedIds.length === 0}
            onClick={assembleApproved}
          >
            Assemble approved
          </Button>
          <Button variant="ai" onClick={() => setDrafting(true)}>
            Draft with AI
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            New script
          </Button>
        </div>
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
                    {script.approval === 'approved' && (
                      <span className={styles.approved}>Approved · </span>
                    )}
                    {assemblyStatusLabel(plans[script.id]) && (
                      <span>{assemblyStatusLabel(plans[script.id])} · </span>
                    )}
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
      <GenerateScriptsDialog open={drafting} onOpenChange={setDrafting} />
      <ScriptEditor scriptId={editingId} onOpenChange={(open) => !open && setEditingId(null)} />
    </section>
  )
}
