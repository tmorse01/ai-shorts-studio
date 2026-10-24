// The code that runs one analysis stage. The shots stage is wired in here; the transcript and vision
// providers plug in here in later tasks. Until then those stages are skipped. Tests pass fake runners,
// so no AI call is made.
import type { AnalysisStage, StageResult } from '@shared/analysis/analysis'
import type { JobContext, JobExecutors } from '../jobs/jobQueue'
import { UserFacingError } from '../errors'
import { shotStageRunner, type ShotTools } from './shotDetection'

// outDir is the folder the job may write its output into. Only the shots stage uses it.
export type StageRunner = (path: string, ctx: JobContext, outDir?: string) => Promise<StageResult>
export type StageRunners = Record<AnalysisStage, StageRunner>

export const skippedStageRunners = (): StageRunners => {
  const skip: StageRunner = async () => 'skipped'
  return { transcript: skip, shots: skip, vision: skip }
}

// The stages that run for real. Everything not listed here is still skipped. The vision runner is
// passed in by the app, which owns the AI state; without one, vision is skipped.
export function liveStageRunners(shotTools: ShotTools, vision?: StageRunner): StageRunners {
  return {
    ...skippedStageRunners(),
    shots: shotStageRunner(shotTools),
    vision: vision ?? skippedStageRunners().vision
  }
}

// Turns an analysis job into a call to the runner for its stage.
export function analysisExecutor(runners: StageRunners): JobExecutors['analysis'] {
  return async ({ path, stage, outDir }, ctx) => {
    if (!stage) throw new UserFacingError('The analysis job lost its stage.')
    return runners[stage](path, ctx, outDir)
  }
}
