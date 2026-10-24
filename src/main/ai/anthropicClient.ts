// The one place that calls the Anthropic Messages API. The service depends on the AnthropicClient
// interface, so tests replace it with a fake and CI never reaches the network. The API's reported
// token counts are the only source for usage and cost. Only still images are ever sent, never video.
import { z } from 'zod'
import type { VisionModel } from '@shared/ai/aiSettings'
import { UserFacingError } from '../errors'

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
}

/** One JPEG image in a request, shown under a text label. */
export interface MessageImage {
  label: string
  /** The image bytes, base64 encoded. The media type is always image/jpeg. */
  data: string
}

export interface MessageRequest {
  model: VisionModel
  maxTokens: number
  prompt: string
  /** Images sent before the prompt, each one under its label. */
  images?: MessageImage[]
}

export interface MessageReply {
  /** The text of the reply. */
  text: string
  usage: MessageUsage
}

export interface AnthropicClient {
  /** Sends one message and returns its text and the token counts the API reported for it. */
  sendMessage: (request: MessageRequest) => Promise<MessageReply>
}

/**
 * A failed request. Retryable failures (rate limits, server errors, no connection) carry a flag so the
 * caller can wait and try again. A Retry-After the server sent is kept in milliseconds.
 */
export class AnthropicRequestError extends UserFacingError {
  readonly retryable: boolean
  readonly retryAfterMs: number | undefined

  constructor(
    message: string,
    options: { details?: string; retryable: boolean; retryAfterMs?: number }
  ) {
    super(message, options.details)
    this.name = 'AnthropicRequestError'
    this.retryable = options.retryable
    this.retryAfterMs = options.retryAfterMs
  }
}

export const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
// The stable Messages API version header. Anthropic keeps this value for all current models.
export const ANTHROPIC_VERSION = '2023-06-01'
const REQUEST_TIMEOUT_MS = 60000

const messageResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
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
    async sendMessage({ model, maxTokens, prompt, images }) {
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
            messages: [{ role: 'user', content: messageContent(prompt, images) }]
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      } catch (error) {
        throw new AnthropicRequestError(
          'Could not reach Anthropic. Check your internet connection.',
          {
            details: describe(error),
            retryable: true
          }
        )
      }

      if (response.status === 401 || response.status === 403) {
        throw new AnthropicRequestError('Anthropic did not accept this API key.', {
          retryable: false
        })
      }
      if (response.status === 429) {
        throw new AnthropicRequestError(
          'Anthropic is limiting requests right now. Try again shortly.',
          {
            retryable: true,
            retryAfterMs: retryAfterOf(response)
          }
        )
      }
      if (response.status >= 500) {
        throw new AnthropicRequestError('Anthropic returned an error.', {
          details: `HTTP ${response.status}`,
          retryable: true
        })
      }
      if (!response.ok) {
        throw new AnthropicRequestError('Anthropic returned an error.', {
          details: `HTTP ${response.status}`,
          retryable: false
        })
      }

      const parsed = messageResponseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) {
        throw new AnthropicRequestError('Anthropic sent a reply the app could not read.', {
          retryable: false
        })
      }
      return {
        text: (parsed.data.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join(''),
        usage: {
          inputTokens: parsed.data.usage.input_tokens,
          outputTokens: parsed.data.usage.output_tokens
        }
      }
    }
  }
}

// Plain text when there are no images, so text-only requests keep their simple form.
function messageContent(prompt: string, images: MessageImage[] | undefined) {
  if (!images || images.length === 0) return prompt
  return [
    ...images.flatMap((image) => [
      { type: 'text', text: image.label },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: image.data }
      }
    ]),
    { type: 'text', text: prompt }
  ]
}

// Retry-After is sent in seconds. A date or a bad value is ignored.
function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  const seconds = header === null ? NaN : Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
