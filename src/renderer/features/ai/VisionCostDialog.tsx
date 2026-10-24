// Asked once per project, before its first vision pass: how many shots would be described, what that
// is likely to cost, and whether to go ahead. Closing the dialog changes nothing; it returns when the
// number of shots changes or the app restarts.
import { useEffect, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { VISION_MODEL_LABELS, formatUsd, type VisionEstimate } from '@shared/ai/aiSettings'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { analysisStore } from '../analysis/analysisStore'
import { decideVisionPass } from '../analysis/analysisSync'
import { aiStore } from './aiStore'
import { estimateVisionPass } from './aiSync'
import { pendingVisionPass } from './aiText'
import styles from './VisionCostDialog.module.css'

export function VisionCostDialog(): JSX.Element {
  const filesByFolder = useStore(analysisStore, (state) => state.filesByFolder)
  const model = useStore(aiStore, (state) => state.status?.settings.visionModel)
  const pending = pendingVisionPass(filesByFolder)
  const folderPath = pending?.folderPath
  const shots = pending?.shots ?? 0
  const key = `${folderPath ?? ''}:${shots}`
  const [closedFor, setClosedFor] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<VisionEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const open = folderPath !== undefined && closedFor !== key

  useEffect(() => {
    if (!open) return
    let current = true
    setEstimate(null)
    void estimateVisionPass(window.api, shots).then((result) => {
      if (current) setEstimate(result)
    })
    return () => {
      current = false
    }
  }, [open, shots, folderPath])

  async function answer(decision: 'confirmed' | 'skipped') {
    if (!folderPath || busy) return
    setBusy(true)
    await decideVisionPass(window.api, folderPath, decision)
    setBusy(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setClosedFor(key)
      }}
      title="Describe the footage with AI?"
      description={`${shots} ${shots === 1 ? 'shot' : 'shots'} would be described by ${VISION_MODEL_LABELS[model ?? 'claude-haiku-5-5']}.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => void answer('skipped')} disabled={busy}>
            Skip vision
          </Button>
          <Button variant="ai" onClick={() => void answer('confirmed')} loading={busy}>
            Confirm
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        {estimate
          ? `Estimated cost: ${formatUsd(estimate.estimateUsd)}. ${
              estimate.remainingUsd === null
                ? 'No monthly cap is set.'
                : `${formatUsd(estimate.remainingUsd)} is left under this month's cap.`
            }`
          : 'Estimating the cost...'}
      </p>
      <p className={styles.note}>
        The estimate is a planning figure. The real cost is counted from the token counts the API
        reports. Skipping leaves this project's footage without vision descriptions.
      </p>
    </Dialog>
  )
}
