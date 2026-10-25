import { Fragment, useRef, useState, type JSX } from 'react'
import type { LineRewriteAction } from '@shared/ai/lineRewrite'
import type { ScriptRunInput } from '@shared/ai/scriptGeneration'
import type { Script, Short } from '@shared/project/schema'
import { X } from 'lucide-react'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { Select } from '@renderer/ui/Select'
import { IconButton } from '@renderer/ui/IconButton'
import { toast } from '../toasts/toast'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand, undoProjectEdit } from '../shorts/shortActions'
import {
  addScriptLineCommand,
  attachScriptCommand,
  createShortFromScriptCommand,
  discardScriptCommand,
  editScriptLineCommand,
  moveScriptLineCommand,
  removeScriptLineCommand,
  replaceScriptDraftCommand,
  rewriteScriptLineCommand,
  setScriptApprovalCommand
} from './scriptCommands'
import { draftScripts, estimateScriptDrafts, rewriteLine, scriptsFromDrafts } from './scriptDrafts'
import { ScriptLineRow } from './ScriptLineRow'
import { AssemblyReviewDialog } from '../assembly/AssemblyReviewDialog'
import { ReassembledLineActions } from '../assembly/ReassembledLineActions'
import { reassembleLine } from '../assembly/reassembleLine'
import { videoTrackId } from '../assembly/assemblyReview'
import { estimatedReadSeconds, formatReadTime, scriptWordCount } from './scriptStats'
import styles from './ScriptEditor.module.css'

export interface ScriptEditorProps {
  // The script to edit, or null when the editor is closed.
  scriptId: string | null
  onOpenChange: (open: boolean) => void
}

const NO_SHORTS: Short[] = []

// Edits one script: its lines, word count and read time, and the shorts written from it. Every
// change is a project command, so it can be undone.
export function ScriptEditor({ scriptId, onOpenChange }: ScriptEditorProps): JSX.Element {
  const script = useProjectStore((state) =>
    scriptId ? state.current?.project.scripts.find((item) => item.id === scriptId) : undefined
  )
  return (
    <Dialog
      open={scriptId !== null && script !== undefined}
      onOpenChange={onOpenChange}
      title={script?.title ?? 'Script'}
      description={script?.topic || undefined}
      wide
    >
      {script && <ScriptEditorBody script={script} onDiscarded={() => onOpenChange(false)} />}
    </Dialog>
  )
}

// How many neighbouring lines on each side go to the rewrite as context.
const CONTEXT_LINES = 3

interface Suggestion {
  lineId: string
  action: LineRewriteAction
  text: string
}

function ScriptEditorBody({
  script,
  onDiscarded
}: {
  script: Script
  onDiscarded: () => void
}): JSX.Element {
  const shorts = useProjectStore((state) => state.current?.project.shorts ?? NO_SHORTS)
  const current = useProjectStore((state) => state.current)
  const draggedIdRef = useRef<string | null>(null)
  const [rewritingLineId, setRewritingLineId] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [reviewingFootage, setReviewingFootage] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  // The line being re-assembled on its short (#142), and the line whose optional next steps are showing.
  const [reassemblingLineId, setReassemblingLineId] = useState<string | null>(null)
  const [nextStepsLineId, setNextStepsLineId] = useState<string | null>(null)
  const now = () => new Date().toISOString()
  const approved = script.approval === 'approved'

  function toggleApproval() {
    applyProjectCommand(
      setScriptApprovalCommand(script.id, approved ? 'draft' : 'approved', script.title)
    )
  }

  // Drafts a new version of this script from the same topic. It needs a cost check first, the same as
  // the Draft with AI dialog. The new draft replaces the lines and goes back to draft; Undo restores it.
  async function regenerate() {
    if (!current || regenerating) return
    const input: ScriptRunInput = {
      projectFolder: current.folderPath,
      media: current.project.media.map((item) => ({ id: item.id, fileName: item.fileName })),
      request: {
        topic: (script.topic || script.title).trim(),
        count: 1,
        targetSeconds: null,
        tone: '',
        notes: '',
        reuseFootage: true
      }
    }
    setRegenerating(true)
    const estimate = await estimateScriptDrafts(window.api, input)
    if (!estimate || estimate.capStatus === 'reached') {
      if (estimate) {
        toast.error({
          title: 'Cannot regenerate the script',
          description: "This month's AI spend cap is reached. Raise the cap in Settings."
        })
      }
      setRegenerating(false)
      return
    }
    const drafts = await draftScripts(window.api, input)
    setRegenerating(false)
    if (!drafts || drafts.length === 0) return
    const [fresh] = scriptsFromDrafts(drafts)
    applyProjectCommand(replaceScriptDraftCommand(script.id, fresh))
    toast.info({
      title: 'Regenerated the script',
      description: 'It is back to draft for review.',
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  function discard() {
    applyProjectCommand(discardScriptCommand(script.id, script.title))
    onDiscarded()
    toast.info({
      title: 'Discarded the script',
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  const words = scriptWordCount(script)
  const readTime = formatReadTime(estimatedReadSeconds(words))
  const attached = shorts.filter((short) => short.scriptId === script.id)
  const available = shorts.filter((short) => short.scriptId !== script.id)
  // The short that footage is re-assembled on: the first attached short with an unlocked video track (#142).
  const footageShort = attached.find((short) => videoTrackId(short) !== undefined)

  function moveLine(lineId: string, toIndex: number) {
    applyProjectCommand(moveScriptLineCommand(script.id, lineId, toIndex))
  }

  function removeLine(lineId: string) {
    applyProjectCommand(removeScriptLineCommand(script.id, lineId))
    toast.info({
      title: 'Removed line',
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  // Drop puts the dragged line where the target line sits.
  function dropOn(targetIndex: number) {
    const fromId = draggedIdRef.current
    draggedIdRef.current = null
    if (!fromId) return
    const fromIndex = script.lines.findIndex((line) => line.id === fromId)
    if (fromIndex === -1 || fromIndex === targetIndex) return
    moveLine(fromId, targetIndex)
  }

  // Asks for a rewrite of one line and shows it as a suggestion. Nothing changes until Accept.
  async function rewrite(lineId: string, action: LineRewriteAction) {
    const index = script.lines.findIndex((line) => line.id === lineId)
    if (index === -1 || rewritingLineId !== null) return
    setSuggestion(null)
    setRewritingLineId(lineId)
    const text = await rewriteLine(window.api, {
      action,
      text: script.lines[index].text,
      scriptTitle: script.title,
      before: script.lines
        .slice(Math.max(0, index - CONTEXT_LINES), index)
        .map((line) => line.text),
      after: script.lines.slice(index + 1, index + 1 + CONTEXT_LINES).map((line) => line.text)
    })
    setRewritingLineId(null)
    if (text !== null) setSuggestion({ lineId, action, text })
  }

  function acceptSuggestion() {
    if (!suggestion) return
    applyProjectCommand(rewriteScriptLineCommand(script.id, suggestion.lineId, suggestion.text))
    setSuggestion(null)
    toast.info({
      title: 'Rewrote the line',
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  // Re-assembles one line on the first attached short that has a video track to put footage on (#142).
  // Only that line's unlocked clips change. The optional next steps show under the line once it is applied.
  async function reassemble(lineId: string) {
    if (!footageShort || reassemblingLineId !== null) return
    setReassemblingLineId(lineId)
    const outcome = await reassembleLine(footageShort.id, lineId)
    setReassemblingLineId(null)
    if (outcome === 'applied') setNextStepsLineId(lineId)
  }

  function newShortFromScript() {
    const shortId = crypto.randomUUID()
    applyProjectCommand(createShortFromScriptCommand(shortId, script.id, now()))
    toast.info({
      title: 'Created a short from this script',
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  return (
    <div className={styles.body}>
      <p className={styles.stats}>
        {approved ? 'Approved' : 'Draft'} · {script.lines.length}{' '}
        {script.lines.length === 1 ? 'line' : 'lines'} · {words} {words === 1 ? 'word' : 'words'} ·
        about {readTime} read
      </p>

      <div className={styles.actions}>
        <Button variant={approved ? 'secondary' : 'primary'} onClick={toggleApproval}>
          {approved ? 'Unapprove' : 'Approve'}
        </Button>
        <Button variant="ai" onClick={() => void regenerate()} loading={regenerating}>
          Regenerate
        </Button>
        <Button variant="destructive" onClick={discard}>
          Discard
        </Button>
      </div>

      {script.lines.length === 0 ? (
        <p className={styles.none}>No lines yet. Add the first line below.</p>
      ) : (
        <ol className={styles.lines} aria-label="Script lines">
          {script.lines.map((line, index) => (
            <Fragment key={line.id}>
              <ScriptLineRow
                index={index}
                lineCount={script.lines.length}
                text={line.text}
                onChangeText={(text) => {
                  if (suggestion?.lineId === line.id) setSuggestion(null)
                  applyProjectCommand(editScriptLineCommand(script.id, line.id, text))
                }}
                onRemove={() => removeLine(line.id)}
                onMove={(toIndex) => moveLine(line.id, toIndex)}
                onDragStart={() => {
                  draggedIdRef.current = line.id
                }}
                onDropHere={() => dropOn(index)}
                onRewrite={(action) => void rewrite(line.id, action)}
                rewriting={rewritingLineId === line.id}
                suggestion={
                  suggestion?.lineId === line.id
                    ? { text: suggestion.text, action: suggestion.action }
                    : null
                }
                onAcceptSuggestion={acceptSuggestion}
                onDiscardSuggestion={() => setSuggestion(null)}
                onReassemble={footageShort ? () => void reassemble(line.id) : undefined}
                reassembling={reassemblingLineId === line.id}
              />
              {footageShort && nextStepsLineId === line.id && (
                <li>
                  <ReassembledLineActions
                    shortId={footageShort.id}
                    scriptId={script.id}
                    lineId={line.id}
                    lineText={line.text}
                    lineIndex={index}
                    onDismiss={() => setNextStepsLineId(null)}
                  />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      )}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() =>
            applyProjectCommand(
              addScriptLineCommand(script.id, { id: crypto.randomUUID(), text: '' })
            )
          }
        >
          Add line
        </Button>
        <Button variant="ai" onClick={() => setReviewingFootage(true)}>
          Match footage
        </Button>
        <AssemblyReviewDialog
          open={reviewingFootage}
          onOpenChange={setReviewingFootage}
          scriptId={script.id}
        />
      </div>

      <section aria-label="Shorts from this script" className={styles.shorts}>
        <h3 className={styles.heading}>Shorts from this script</h3>
        {attached.length === 0 ? (
          <p className={styles.none}>No shorts use this script yet.</p>
        ) : (
          <ul className={styles.attached}>
            {attached.map((short) => (
              <li key={short.id} className={styles.attachedItem}>
                <span className={styles.shortName}>{short.name}</span>
                <IconButton
                  icon={X}
                  label={`Detach ${short.name}`}
                  onClick={() => applyProjectCommand(attachScriptCommand(short.id, null, now()))}
                />
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <Select
            aria-label="Attach a short to this script"
            placeholder="Attach a short"
            value=""
            disabled={available.length === 0}
            options={available.map((short) => ({ value: short.id, label: short.name }))}
            onValueChange={(shortId) =>
              applyProjectCommand(attachScriptCommand(shortId, script.id, now()))
            }
          />
          <Button variant="primary" onClick={newShortFromScript}>
            New short from script
          </Button>
        </div>
      </section>
    </div>
  )
}
