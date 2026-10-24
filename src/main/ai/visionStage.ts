// The code that runs the vision stage. It checks the key and the monthly cap again right before the
// request, so a cap reached while the stage waits in the queue still stops it. The describing call is
// passed in: until a describer is set up, the stage is skipped. Usage is recorded from the token
// counts the API reports, never estimated.
import type { VisionModel } from '@shared/ai/aiSettings'
import type { StageRunner } from '../analysis/stageRunners'
import type { AnthropicClient, MessageUsage } from './anthropicClient'
import type { AiService } from './aiService'

export interface VisionDescribeRequest {
  path: string
  outDir?: string
  model: VisionModel
  client: AnthropicClient
}

// Sends the footage to the model and returns the token counts the API reported for the requests made.
export type VisionDescriber = (request: VisionDescribeRequest) => Promise<MessageUsage>

export function visionStageRunner(ai: AiService, describe?: VisionDescriber): StageRunner {
  return async (path, _ctx, outDir) => {
    if (!describe || ai.visionAvailability() !== 'ready') return 'skipped'
    const model = ai.visionModel()
    const client = await ai.client()
    const usage = await describe({ path, outDir, model, client })
    await ai.recordUsage(model, usage)
    return 'done'
  }
}
