// The one place that calls the Anthropic Messages API. The service depends on the AnthropicClient
// interface, so tests replace it with a fake and CI never reaches the network. The API's reported
// token counts are the only source for usage and cost.
import { z } from 'zod'
import type { VisionModel } from '@shared/ai/aiSettings'
import { UserFacingError } from '../errors'

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
}

export interface MessageRequest {
  model: VisionModel
  maxTokens: number
  prompt: string
}

export interface AnthropicClient {
  /** Sends one message and returns the token counts the API reported for it. */
  sendMessage: (request: MessageRequest) => Promise<MessageUsage>
}

export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2026-10-21'
const REQUEST_TIMEOUT_MS = 60000

const messageResponseSchema = z.object({
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative()
  })
})

export interface AnthropicClientOptions {
  apiKey: string
  /** Replaced in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

export function createAnthropicClient({
  apiKey,
  fetchImpl = fetch
}: AnthropicClientOptions): AnthropicClient {
  return {
    async sendMessage({ model, maxTokens, prompt }) {
      let response: Response
      try {
        response = await fetchImpl(MESSAGES_URL, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }]
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      } catch (error) {
        throw new UserFacingError(
          'Could not reach Anthropic. Check your internet connection.',
          describe(error)
        )
      }

      if (response.status === 401 || response.status === 403) {
        throw new UserFacingError('Anthropic did not accept this API key.')
      }
      if (response.status === 429) {
        throw new UserFacingError('Anthropic is limiting requests right now. Try again shortly.')
      }
      if (!response.ok) {
        throw new UserFacingError(
          'Anthropic returned an error.',
          `HTTP ${response.status}`
        )
      }

      const parsed = messageResponseSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new UserFacingError('Anthropic sent a reply the app could not read.')
      }
      return {
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
