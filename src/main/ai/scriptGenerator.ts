// Drafts scripts with the cloud model: the estimate shown before a run, and the run itself. The request
// is grounded in the footage through the context builder, sent once with the saved key, and its reply is
// read with the shared parser. Usage is recorded from the reply's token counts. Nothing is saved here:
// the renderer turns the drafts into scripts through a project command, so the user can undo them.
import { remainingUnderCap, type VisionModel } from '@shared/ai/aiSettings'
import { buildScriptContext, type ScriptContext } from '@shared/ai/scriptContext'
import {
  buildScriptPrompt,
  estimateScriptCostUsd,
  parseScriptReply,
  SCRIPT_MAX_TOKENS,
  type GeneratedScript,
  type ScriptEstimate,
  type ScriptRunInput
} from '@shared/ai/scriptGeneration'
import { UserFacingError } from '../errors'
import type { AiService } from './aiService'
import type { ScriptFootageSource } from './scriptFootage'

interface Grounding {
  context: ScriptContext
}

async function groundingFor(
  footage: ScriptFootageSource,
  input: ScriptRunInput
): Promise<Grounding> {
  const found = await footage(input.projectFolder, input.media)
  const { request } = input
  const context = buildScriptContext({
    topic: request.topic,
    targetSeconds: request.targetSeconds,
    tone: request.tone,
    notes: request.notes,
    transcript: found.transcript,
    shots: found.shots
  })
  return { context }
}

/** What a run would cost, against the monthly cap, and what footage it would use. */
export async function estimateScriptRun(
  ai: AiService,
  footage: ScriptFootageSource,
  input: ScriptRunInput
): Promise<ScriptEstimate> {
  const { context } = await groundingFor(footage, input)
  const status = await ai.status()
  const model: VisionModel = status.settings.visionModel
  return {
    model,
    estimateUsd: estimateScriptCostUsd(model, context.text, input.request.count),
    remainingUsd: remainingUnderCap(status.usage.costUsd, status.settings.monthlySpendCapUsd),
    capStatus: status.capStatus,
    transcriptUsed: context.transcriptUsed,
    shotsUsed: context.shotsUsed
  }
}

/** Drafts the requested scripts. Throws a plain message when no key is saved, the cap is reached, or the reply is unreadable. */
export async function generateScripts(
  ai: AiService,
  footage: ScriptFootageSource,
  input: ScriptRunInput
): Promise<GeneratedScript[]> {
  await ai.ready()
  const availability = ai.visionAvailability()
  if (availability === 'no-key') {
    throw new UserFacingError('Add an Anthropic API key in Settings first.')
  }
  if (availability === 'capped') {
    throw new UserFacingError(
      "This month's AI spend cap is reached. Raise the cap in Settings to continue."
    )
  }

  const { context } = await groundingFor(footage, input)
  const model = ai.visionModel()
  const client = await ai.client()
  const reply = await client.sendMessage({
    model,
    maxTokens: SCRIPT_MAX_TOKENS,
    prompt: buildScriptPrompt(input.request, context.text)
  })
  await ai.recordUsage(model, reply.usage)

  const scripts = parseScriptReply(reply.text)
  if (!scripts) throw new UserFacingError('Claude sent a reply the app could not read. Try again.')
  return scripts.slice(0, input.request.count)
}
