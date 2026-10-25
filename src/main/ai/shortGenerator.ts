// Proposes shorts from analysed sources with the cloud model (Epic 16, #311, part a). The prompt is built by the
// shared planner, sent once with the saved key, and the reply is read with the shared reader and snapped to the
// source boundaries. Usage is recorded from the reply's token counts. Nothing is saved here: the proposals are
// returned for review, and the renderer creates the accepted ones through a project command.
import {
  alignShortPlan,
  applyReusePolicy,
  buildShortsPrompt,
  parseShortsReply,
  SHORTS_MAX_TOKENS,
  type GenerateShortsInput,
  type GeneratedShort,
  type ShortsPromptSource,
  type ShortsSourceFootage
} from '@shared/shorts/shortPlan'
import { UserFacingError } from '../errors'
import type { AiService } from './aiService'

/** Reads what one source's shorts are based on. Tests pass a fake, so no disk is read. */
export type ShortsFootageSource = (
  projectFolder: string,
  mediaId: string
) => Promise<ShortsSourceFootage & { durationMs?: number }>

/**
 * Proposes the requested shorts. Throws a plain message when no key is saved, the cap is reached, or the reply
 * cannot be read. An empty list is a valid answer: the model found nothing worth a short.
 */
export async function proposeShorts(
  ai: AiService,
  footage: ShortsFootageSource,
  input: GenerateShortsInput
): Promise<GeneratedShort[]> {
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

  const footageByMedia: Record<string, ShortsSourceFootage & { durationMs?: number }> = {}
  const sources: ShortsPromptSource[] = []
  for (const source of input.sources) {
    const found = await footage(input.projectFolder, source.mediaId)
    footageByMedia[source.mediaId] = { ...found, durationMs: source.durationMs }
    sources.push({ mediaId: source.mediaId, fileName: source.fileName, footage: found })
  }

  const model = ai.visionModel()
  const client = await ai.client()
  const reply = await client.sendMessage({
    model,
    maxTokens: SHORTS_MAX_TOKENS,
    prompt: buildShortsPrompt({
      request: input.request,
      sources,
      existingMoments: input.existingMoments
    })
  })
  await ai.recordUsage(model, reply.usage)

  const proposed = parseShortsReply(reply.text)
  if (proposed === undefined) {
    throw new UserFacingError('Claude sent a reply the app could not read. Try again.')
  }
  const aligned = alignShortPlan(proposed, footageByMedia)
  return applyReusePolicy(aligned, input.request.avoidReuse).slice(0, input.request.count)
}
