// The code that runs one analysis stage. The real transcript, shot and vision providers plug in here
// in later tasks. Until then every stage is skipped. Tests pass fake runners, so no AI call is made.
import type { AnalysisStage, StageOutcome } from '@shared/analysis/analysis'
import type { JobContext, JobExecutors } from '../jobs/jobQueue'
import { UserFacingError } from '../errors'

export type StageRunner = (path: string, ctx: JobContext) => Promise<StageOutcome>
export type StageRunners = Record<AnalysisStage, StageRunner>

export const skippedStageRunners = (): StageRunners => {
  const skip: StageRunner = async () => 'skipped'
  return { transcript: skip, shots: skip, vision: skip }
}

// Turns an analysis job into a call to the runner for its stage.
export function analysisExecutor(runners: StageRunners): JobExecutors['analysis'] {
  return async ({ path, stage }, ctx) => {
    if (!stage) throw new UserFacingError('The analysis job lost its stage.')
    return runners[stage](path, ctx)
  }
}
