// The code that runs one analysis stage. The transcript and shots stages are wired in here, and the vision
// provider plugs in here in a later task. Until then vision is skipped. Tests pass fake runners, so no AI
// call is made and no speech model is loaded.
import type { AnalysisStage, StageResult } from '@shared/analysis/analysis'
import type { JobContext, JobExecutors } from '../jobs/jobQueue'
import { UserFacingError } from '../errors'
import { shotStageRunner, type ShotTools } from './shotDetection'

// outDir is the cache folder the job may write its frames into (shots and vision read them). resultFile is
// where a stage keeps results outside cache/, so Clear cache leaves them. Only the vision stage uses it.
export type StageRunner = (
  path: string,
  ctx: JobContext,
  outDir?: string,
  resultFile?: string
) => Promise<StageResult>
export type StageRunners = Record<AnalysisStage, StageRunner>

export const skippedStageRunners = (): StageRunners => {
  const skip: StageRunner = async () => 'skipped'
  return { transcript: skip, shots: skip, vision: skip }
}

// The stages that run for real. The vision runner is passed in by the app, which owns the AI state;
// without one, vision is skipped. The transcript runner is passed in too, so tests can leave it out.
export function liveStageRunners(
  shotTools: ShotTools,
  vision?: StageRunner,
  transcript?: StageRunner
): StageRunners {
  return {
    ...skippedStageRunners(),
    transcript: transcript ?? skippedStageRunners().transcript,
    shots: shotStageRunner(shotTools),
    vision: vision ?? skippedStageRunners().vision
  }
}

// Turns an analysis job into a call to the runner for its stage.
export function analysisExecutor(runners: StageRunners): JobExecutors['analysis'] {
  return async ({ path, stage, outDir, resultFile }, ctx) => {
    if (!stage) throw new UserFacingError('The analysis job lost its stage.')
    return runners[stage](path, ctx, outDir, resultFile)
  }
}
