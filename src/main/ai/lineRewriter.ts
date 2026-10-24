// Rewrites one script line with the cloud model: one request with the saved key, its reply read with the
// shared reader, and its usage recorded from the reply's token counts. Nothing is saved here: the renderer
// accepts the text through a project command, so the user can undo it.
import {
  buildLineRewritePrompt,
  LINE_REWRITE_MAX_TOKENS,
  parseLineRewriteReply,
  type LineRewriteInput,
  type LineRewriteOutput
} from '@shared/ai/lineRewrite'
import { UserFacingError } from '../errors'
import type { AiService } from './aiService'

/** Rewrites the line. Throws a plain message when no key is saved, the cap is reached, or the reply is unreadable. */
export async function rewriteScriptLine(
  ai: AiService,
  input: LineRewriteInput
): Promise<LineRewriteOutput> {
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

  const model = ai.visionModel()
  const client = await ai.client()
  const reply = await client.sendMessage({
    model,
    maxTokens: LINE_REWRITE_MAX_TOKENS,
    prompt: buildLineRewritePrompt(input)
  })
  await ai.recordUsage(model, reply.usage)

  const text = parseLineRewriteReply(reply.text)
  if (text === null) {
    throw new UserFacingError('Claude sent a reply the app could not read. Try again.')
  }
  return { text }
}
