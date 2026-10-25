import { describe, expect, it } from 'vitest'
import {
  createElevenLabsProvider,
  ELEVENLABS_BASE_URL,
  speechErrorMessage
} from '../src/main/tts/elevenLabsProvider'
import { UserFacingError } from '../src/main/errors'

// Every request goes to a fake fetch. Nothing reaches the network.
function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return respond(url, init ?? {})
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('ElevenLabs provider: voice list', () => {
  it('maps the voices, sorts them by name, and sends the key in a header', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      Response.json({
        voices: [
          { voice_id: 'v2', name: 'Zoe', category: 'premade' },
          { voice_id: 'v1', name: 'Adam' }
        ]
      })
    )
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    const voices = await provider.listVoices()

    expect(voices).toEqual([
      { id: 'v1', name: 'Adam' },
      { id: 'v2', name: 'Zoe', category: 'premade' }
    ])
    expect(calls[0].url).toBe(`${ELEVENLABS_BASE_URL}/voices`)
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe(
      'test-key-000000000000'
    )
  })

  it('rejects a voice list it cannot read, with a plain message', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ unexpected: true }))
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    await expect(provider.listVoices()).rejects.toThrow(UserFacingError)
    await expect(provider.listVoices()).rejects.toThrow('could not read')
  })
})

describe('ElevenLabs provider: synthesis', () => {
  it('posts the text and model to the voice and returns the audio bytes', async () => {
    const { fetchImpl, calls } = fakeFetch(
      () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    )
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    const audio = await provider.synthesize({ voiceId: 'voice/one', text: 'Hello.' })

    expect([...audio]).toEqual([1, 2, 3, 4])
    expect(calls[0].url).toContain(`${ELEVENLABS_BASE_URL}/text-to-speech/voice%2Fone`)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ text: 'Hello.' })
  })

  it('treats an empty audio reply as a failure', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(new Uint8Array(), { status: 200 }))
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    await expect(provider.synthesize({ voiceId: 'v1', text: 'Hi' })).rejects.toThrow(
      'returned no audio'
    )
  })
})

describe('ElevenLabs provider: error handling', () => {
  it.each([
    [401, 'did not accept the key'],
    [403, 'did not accept the key'],
    [429, 'limiting requests'],
    [422, 'could not use this text or voice'],
    [500, 'speech request failed']
  ])('turns HTTP %i into a plain message', async (status, text) => {
    const { fetchImpl } = fakeFetch(
      () => new Response('{"detail":"raw secret server text"}', { status })
    )
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    const error = await provider.listVoices().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as Error).message).toContain(text)
    expect((error as Error).message).not.toContain('raw secret server text')
  })

  it('turns a dropped connection into a plain message', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const provider = createElevenLabsProvider({ apiKey: 'test-key-000000000000', fetchImpl })

    await expect(provider.synthesize({ voiceId: 'v1', text: 'Hi' })).rejects.toThrow(
      'Could not reach ElevenLabs'
    )
  })

  it('has a message for every status it names', () => {
    expect(speechErrorMessage(401)).toContain('Settings')
    expect(speechErrorMessage(418)).toBe('The speech request failed. Try again later.')
  })
})
