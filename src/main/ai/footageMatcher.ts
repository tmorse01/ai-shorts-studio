// Matches script lines to footage with the cloud model (Epic 15, #138): the candidates and the prompt are
// built by the shared matcher, sent once with the saved key, and the reply is read with the shared
// reader. Usage is recorded from the reply's token counts. Nothing is saved here: the plan is returned
// for the renderer to review and apply through a project command, so the user can undo it.
import { remainingUnderCap, type VisionModel } from '@shared/ai/aiSettings'
import {
  buildFootagePlan,
  estimateFootageMatchCostUsd,
  FOOTAGE_MATCH_MAX_TOKENS,
  parseMatchReply,
  prepareFootageMatch,
  type FootageMatchInput,
  type FootageMatchResult
} from '@shared/assembly/footageMatch'
import { SearchIndex, type SearchDoc } from '@shared/search/searchIndex'
import type { UsedRange } from '@shared/assembly/footageSpread'
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import { UserFacingError } from '../errors'
import type { AiService } from './aiService'

export interface FootageMatchEstimate {
  model: VisionModel
  estimateUsd: number
  remainingUsd: number | null
  capStatus: 'uncapped' | 'within' | 'reached'
  /** Lines that have candidate clips, so the ones a run would send. */
  lineCount: number
}

/** What a match run would cost against the monthly cap. Makes no API call. */
export async function estimateFootageMatch(
  ai: AiService,
  input: FootageMatchInput
): Promise<FootageMatchEstimate> {
  const prepared = prepareFootageMatch(input)
  const status = await ai.status()
  const model: VisionModel = status.settings.visionModel
  return {
    model,
    estimateUsd: estimateFootageMatchCostUsd(model, prepared.prompt, prepared.promptLineCount),
    remainingUsd: remainingUnderCap(status.usage.costUsd, status.settings.monthlySpendCapUsd),
    capStatus: status.capStatus,
    lineCount: prepared.promptLineCount
  }
}

/**
 * Picks footage for each script line. Throws a plain message when no key is saved, the cap is reached,
 * or the reply is unreadable. A script whose lines have no candidates is answered without an API call.
 */
export async function matchFootage(
  ai: AiService,
  input: FootageMatchInput
): Promise<FootageMatchResult> {
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

  const prepared = prepareFootageMatch(input)
  if (prepared.promptLineCount === 0) {
    return buildFootagePlan(prepared.request, [], input)
  }

  const model = ai.visionModel()
  const client = await ai.client()
  const reply = await client.sendMessage({
    model,
    maxTokens: FOOTAGE_MATCH_MAX_TOKENS,
    prompt: prepared.prompt
  })
  await ai.recordUsage(model, reply.usage)

  const picks = parseMatchReply(reply.text, prepared.request)
  if (picks === null) {
    throw new UserFacingError('Claude sent a reply the app could not read. Try again.')
  }
  return buildFootagePlan(prepared.request, picks, input)
}

/**
 * Runs a match from the renderer's request. The search index is rebuilt here from the documents it sent,
 * one group per media item, then the same matchFootage path runs as for any other caller.
 */
export async function matchFootageRequest(
  ai: AiService,
  request: FootageMatchRequest,
  usedRanges: readonly UsedRange[] = []
): Promise<FootageMatchResult> {
  const index = new SearchIndex()
  const byMedia = new Map<string, SearchDoc[]>()
  for (const doc of request.docs) {
    const docs = byMedia.get(doc.mediaId) ?? []
    docs.push(doc)
    byMedia.set(doc.mediaId, docs)
  }
  for (const [mediaId, docs] of byMedia) index.replaceGroup(mediaId, docs)
  return matchFootage(ai, {
    lines: request.lines,
    targetMs: request.targetMs,
    index,
    mediaNames: request.mediaNames,
    shots: request.shots,
    durationsMs: request.durationsMs,
    usedRanges
  })
}
