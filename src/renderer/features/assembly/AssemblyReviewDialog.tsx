// Review panel for a footage match (Epic 15, #139). It shows each line with the clips picked for it,
// lets the user accept or reject each line, and applies the accepted lines as one undoable command.
// Nothing changes on the timeline until Apply.
import { useState, type JSX } from 'react'
import type { FootageMatchResultData } from '@shared/assembly/footageMatchRequest'
import type { Script } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { useThumb } from '../timeline/useThumb'
import { searchIndex } from '../search/searchIndexStore'
import { analysisStore } from '../analysis/analysisStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { toast } from '../toasts/toast'
import { useProjectStore } from '../project/useProjectStore'
import { applyFootagePlanCommand } from './assemblyCommands'
import { matchScriptFootage } from './assemblyActions'
import { useAssemblyQueueStore } from './assemblyQueueStore'
import {
  acceptedPlan,
  attachedShort,
  buildMatchRequest,
  shotsByMediaOf,
  videoTrackId
} from './assemblyReview'
import styles from './AssemblyReviewDialog.module.css'

export interface AssemblyReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scriptId: string
}

export function AssemblyReviewDialog({
  open,
  onOpenChange,
  scriptId
}: AssemblyReviewDialogProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Review footage"
      description="Claude picks footage for each line from your transcripts and shot descriptions. Nothing changes until you apply."
      wide
    >
      {open && <ReviewBody scriptId={scriptId} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function ReviewBody({ scriptId, onDone }: { scriptId: string; onDone: () => void }): JSX.Element {
  const project = useProjectStore((state) => state.current?.project)
  const folderPath = useProjectStore((state) => state.current?.folderPath)
  // A match queued from the scripts list is shown here, ready to review. Showing it applies nothing.
  const queued = useAssemblyQueueStore((state) => state.plans[scriptId])
  const queuedResult = queued?.status === 'ready' ? queued.result : null
  const [result, setResult] = useState<FootageMatchResultData | null>(queuedResult)
  // True while the plan on screen came from an assembly batch, not from a match run here (#148).
  const [fromBatch, setFromBatch] = useState(queuedResult !== null)
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(
    () => new Set(queuedResult ? queuedResult.plan.lines.map((line) => line.lineId) : [])
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const script: Script | undefined = project?.scripts.find((item) => item.id === scriptId)
  if (!project || !folderPath || !script) {
    return <p className={styles.note}>This script no longer exists.</p>
  }
  const short = attachedShort(project, script.id)
  // With no short yet, the footage goes on the main track of the draft short that Apply creates.
  const trackId = short ? videoTrackId(short) : crypto.randomUUID()
  const textByLine = new Map(script.lines.map((line) => [line.id, line.text]))

  async function runMatch(): Promise<void> {
    if (!project || !folderPath || !script) return
    setError(null)
    const request = buildMatchRequest({
      script,
      project,
      docs: searchIndex.docs(),
      shotsByMedia: shotsByMediaOf(analysisStore.getState().filesByFolder[folderPath])
    })
    if (request.lines.length === 0) {
      setError('Write some lines before matching footage.')
      return
    }
    setBusy(true)
    const data = await matchScriptFootage(window.api, request)
    setBusy(false)
    if (data) {
      setResult(data)
      setFromBatch(false)
      setAccepted(new Set(data.plan.lines.map((line) => line.lineId)))
    }
  }

  function toggle(lineId: string): void {
    setAccepted((current) => {
      const next = new Set(current)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  function apply(): void {
    if (!result || (short && !trackId)) return
    try {
      // A script with no short gets its draft short here, in the same step as the footage (#146).
      applyProjectCommand(
        applyFootagePlanCommand({
          shortId: short?.id ?? crypto.randomUUID(),
          trackId: trackId ?? crypto.randomUUID(),
          plan: acceptedPlan(result.plan, accepted),
          now: new Date().toISOString(),
          newId: () => crypto.randomUUID(),
          ...(short ? {} : { createFromScript: { scriptId, batchDraft: fromBatch } })
        })
      )
      toast.success({
        title: short ? 'Footage applied' : 'Draft short created',
        description: 'Undo restores the timeline.'
      })
      onDone()
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : 'The footage could not be applied.'
      )
    }
  }

  const applyDisabled = !result || accepted.size === 0 || (short !== undefined && !trackId)

  return (
    <div className={styles.body}>
      {!short && <p className={styles.note}>Applying creates a draft short from this script.</p>}
      {short && !trackId && (
        <p className={styles.note}>The short has no unlocked video track to put footage on.</p>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {!result && (
        <div className={styles.start}>
          <Button variant="ai" loading={busy} onClick={() => void runMatch()}>
            Match footage
          </Button>
        </div>
      )}

      {result && (
        <>
          <ol className={styles.lines} aria-label="Matched lines">
            {result.plan.lines.map((line) => {
              const isAccepted = accepted.has(line.lineId)
              return (
                <li key={line.lineId} className={styles.line}>
                  <div className={styles.lineHead}>
                    <p className={styles.lineText}>{textByLine.get(line.lineId)}</p>
                    <Button
                      variant={isAccepted ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={isAccepted}
                      onClick={() => toggle(line.lineId)}
                    >
                      {isAccepted ? 'Accepted' : 'Rejected'}
                    </Button>
                  </div>
                  <ul className={styles.cuts}>
                    {line.cuts.map((cut, index) => (
                      <CutView
                        key={`${line.lineId}-${index}`}
                        folderPath={folderPath}
                        mediaId={cut.sourceId}
                        mediaName={project.media.find((m) => m.id === cut.sourceId)?.fileName}
                        inMs={cut.inMs}
                        outMs={cut.outMs}
                      />
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>

          {result.unmatchedLineIds.length > 0 && (
            <p className={styles.note}>
              No footage found for {result.unmatchedLineIds.length}{' '}
              {result.unmatchedLineIds.length === 1 ? 'line' : 'lines'}. They are left out.
            </p>
          )}
        </>
      )}

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        {result && (
          <Button variant="primary" disabled={applyDisabled} onClick={apply}>
            Apply footage
          </Button>
        )}
      </div>
    </div>
  )
}

function CutView({
  folderPath,
  mediaId,
  mediaName,
  inMs,
  outMs
}: {
  folderPath: string
  mediaId: string
  mediaName: string | undefined
  inMs: number
  outMs: number
}): JSX.Element {
  const thumb = useThumb(folderPath, mediaId, 'thumb.jpg')
  const seconds = (ms: number): string => (ms / 1000).toFixed(1)
  return (
    <li className={styles.cut}>
      {thumb ? (
        <img className={styles.thumb} src={thumb.src} alt="" />
      ) : (
        <span className={styles.thumbEmpty} aria-hidden="true" />
      )}
      <span className={styles.cutLabel}>
        {mediaName ?? 'Unknown clip'} · {seconds(inMs)}s to {seconds(outMs)}s
      </span>
    </li>
  )
}
