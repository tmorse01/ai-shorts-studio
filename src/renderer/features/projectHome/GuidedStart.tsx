import type { JSX } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { pickAndImportMedia } from '../media/importMedia'
import { syncAnalysis } from '../analysis/analysisSync'
import { applyProjectCommand } from '../shorts/shortActions'
import { createShortCommand } from '../shorts/shortCommands'
import { useProjectStore } from '../project/useProjectStore'
import { guideSteps, showGuide, type GuideStepId } from './projectHomeModel'
import styles from './GuidedStart.module.css'

const NO_MEDIA: MediaRef[] = []

// The three-step start for a project without footage and a short. Each step shows done or pending,
// and its button is enabled once the step before it is done. The guide disappears once the project
// has footage and a short.
export function GuidedStart(): JSX.Element | null {
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? null)
  const projectId = useProjectStore((state) => state.current?.project.id ?? null)
  const media = useProjectStore((state) => state.current?.project.media ?? NO_MEDIA)
  const momentCount = useProjectStore((state) => state.current?.project.moments.length ?? 0)
  const shortCount = useProjectStore((state) => state.current?.project.shorts.length ?? 0)
  const router = useRouter()

  const counts = { mediaCount: media.length, momentCount, shortCount }
  if (!showGuide(counts)) return null

  const actions: Record<GuideStepId, { label: string; run: () => void }> = {
    import: { label: 'Import media', run: () => void pickAndImportMedia() },
    moments: {
      label: 'Analyse footage',
      run: () => {
        if (folderPath) void syncAnalysis(window.api, folderPath, media)
      }
    },
    short: {
      label: 'New short',
      run: () => {
        if (!projectId) return
        const shortId = crypto.randomUUID()
        applyProjectCommand(createShortCommand(shortId, new Date().toISOString()))
        void router.navigate({
          to: '/project/$projectId/short/$shortId',
          params: { projectId, shortId }
        })
      }
    }
  }

  return (
    <section aria-label="Getting started" className={styles.guide}>
      <h2 className={styles.heading}>Start here</h2>
      <ol className={styles.steps}>
        {guideSteps(counts).map((step, index) => (
          <li key={step.id} className={styles.step} data-state={step.done ? 'done' : 'pending'}>
            <span className={styles.badge} aria-hidden="true">
              {step.done ? <Check size={14} strokeWidth={2} /> : index + 1}
            </span>
            <div className={styles.text}>
              <p className={styles.label}>
                <span className={styles.visuallyHidden}>{step.done ? 'Done: ' : 'To do: '}</span>
                {step.label}
              </p>
              <p className={styles.description}>{step.description}</p>
            </div>
            {step.done ? null : (
              <Button
                variant={step.enabled ? 'primary' : 'secondary'}
                size="sm"
                disabled={!step.enabled}
                title={step.enabled ? undefined : 'Finish the step before this one first'}
                onClick={actions[step.id].run}
              >
                {actions[step.id].label}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
