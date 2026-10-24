import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_VERSION,
  createAnthropicClient,
  MESSAGES_URL
} from '../src/main/ai/anthropicClient'
import { UserFacingError } from '../src/main/errors'

// A fetch stand-in. Nothing reaches the network: each test decides what Anthropic "replies".
function fakeFetch(status: number, body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const request = { model: 'claude-haiku-5-5' as const, maxTokens: 8, prompt: 'Reply with OK.' }

describe('Anthropic client', () => {
  it('sends the key in a header and reads the usage the API reported', async () => {
    const { calls, fetchImpl } = fakeFetch(200, {
      usage: { input_tokens: 14, output_tokens: 2 }
    })
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl })

    const usage = await client.sendMessage(request)

    expect(usage).toEqual({ inputTokens: 14, outputTokens: 2 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(MESSAGES_URL)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with OK.' }]
    })
  })

  it('says plainly when the key is refused', async () => {
    const { fetchImpl } = fakeFetch(401, { error: 'invalid x-api-key' })
    const client = createAnthropicClient({ apiKey: 'sk-bad', fetchImpl })

    await expect(client.sendMessage(request)).rejects.toThrow(
      'Anthropic did not accept this API key.'
    )
  })

  it('asks the user to wait on a rate limit', async () => {
    const { fetchImpl } = fakeFetch(429)
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl })

    await expect(client.sendMessage(request)).rejects.toThrow('limiting requests')
  })

  it('treats a reply without usage as an unreadable reply, not as zero cost', async () => {
    const { fetchImpl } = fakeFetch(200, { content: [] })
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl })

    const error = await client.sendMessage(request).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as UserFacingError).message).toBe(
      'Anthropic sent a reply the app could not read.'
    )
  })

  it('turns a network failure into a plain message with details', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl })

    const error = await client.sendMessage(request).catch((reason: unknown) => reason)
    expect((error as UserFacingError).message).toBe(
      'Could not reach Anthropic. Check your internet connection.'
    )
    expect((error as UserFacingError).details).toBe('TypeError: fetch failed')
  })
})
