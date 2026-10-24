import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultAiSettings, emptyAiStateFile } from '@shared/ai/aiSettings'
import { shotFrameName } from '@shared/analysis/shots'
import { AiService } from '../src/main/ai/aiService'
import {
  AnthropicRequestError,
  type AnthropicClient,
  type MessageRequest
} from '../src/main/ai/anthropicClient'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { SecretStore } from '../src/main/ai/secretStore'
import { visionStageRunner } from '../src/main/ai/visionStage'
import { loadVisionResult } from '../src/main/ai/visionResultFile'
import { UserFacingError } from '../src/main/errors'
import type { JobContext } from '../src/main/jobs/jobQueue'

// Nothing here reaches the network: the Anthropic client is always a fake.
const KEY = 'sk-ant-test-0000000000000000000000'
const ctx = {
  signal: new AbortController().signal,
  reportProgress: () => undefined
} as unknown as JobContext

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// A clip folder with sampled frames for `shots` shots: even shots have two frames, odd shots three.
async function clipFolder(shots: number): Promise<{ frames: string; result: string }> {
  const root = await mkdtemp(join(tmpdir(), 'vision-stage-'))
  roots.push(root)
  const frames = join(root, 'cache', 'analysis', 'frames', 'media-1')
  await mkdir(frames, { recursive: true })
  for (let shot = 0; shot < shots; shot += 1) {
    const count = shot % 2 === 0 ? 2 : 3
    for (let frame = 0; frame < count; frame += 1) {
      await writeFile(join(frames, shotFrameName(shot, frame)), `frame-${shot}-${frame}`)
    }
  }
  return { frames, result: join(root, 'analysis', 'vision', 'media-1.json') }
}

// The shot numbers labelled in a request's images, in order and without repeats.
function shotsIn(request: MessageRequest): number[] {
  const labels = (request.images ?? []).map((image) => Number(image.label.replace('Shot ', '')))
  return [...new Set(labels)]
}

// Answers every shot in the request with a description and tags, as the model is asked to.
function answeringClient(requests: MessageRequest[] = []): AnthropicClient {
  return {
    sendMessage: async (request) => {
      requests.push(request)
      const reply = shotsIn(request).map((shot) => ({
        shot,
        description: `Shot ${shot} description`,
        tags: ['outdoor']
      }))
      return {
        text: `Here you go:\n${JSON.stringify(reply)}`,
        usage: { inputTokens: 1000, outputTokens: 100 }
      }
    }
  }
}

function serviceWith(options: { key?: boolean; cap?: number | null; client?: AnthropicClient }) {
  let value: string | null = options.key === false ? null : KEY
  const secrets: SecretStore = {
    isAvailable: () => true,
    read: async () => value,
    write: async (secret) => {
      value = secret
    },
    clear: async () => {
      value = null
    }
  }
  const state = memoryAiStateStorage({
    ...emptyAiStateFile(),
    settings: { ...defaultAiSettings(), monthlySpendCapUsd: options.cap ?? null }
  })
  const client = options.client ?? answeringClient()
  return new AiService({
    secrets,
    state,
    createClient: () => client
  })
}

async function readyService(options: Parameters<typeof serviceWith>[0] = {}) {
  const ai = serviceWith(options)
  await ai.ready()
  return ai
}

describe('vision stage runner', () => {
  it('skips without a key and never calls the API', async () => {
    let called = false
    const ai = await readyService({
      key: false,
      client: {
        sendMessage: async () => {
          called = true
          throw new Error('should not be called')
        }
      }
    })
    const dir = await clipFolder(2)

    await expect(visionStageRunner(ai)('clip.mp4', ctx, dir.frames, dir.result)).resolves.toBe(
      'skipped'
    )
    expect(called).toBe(false)
  })

  it('skips when the monthly cap has already been reached', async () => {
    const ai = await readyService({ cap: 0.5 })
    await ai.recordUsage('claude-haiku-5-5', { inputTokens: 10_000_000, outputTokens: 0 })
    const requests: MessageRequest[] = []
    const dir = await clipFolder(2)

    await expect(
      visionStageRunner(ai, { sleep: async () => undefined })(
        'clip.mp4',
        ctx,
        dir.frames,
        dir.result
      )
    ).resolves.toBe('skipped')
    expect(requests).toHaveLength(0)
  })

  it('describes shots in batches, saves them outside cache, and records usage per request', async () => {
    const requests: MessageRequest[] = []
    const ai = await readyService({ client: answeringClient(requests) })
    const dir = await clipFolder(7)

    const outcome = await visionStageRunner(ai, { batchShots: 3, sleep: async () => undefined })(
      'clip.mp4',
      ctx,
      dir.frames,
      dir.result
    )

    expect(outcome).toBe('done')
    expect(requests.map(shotsIn)).toEqual([[0, 1, 2], [3, 4, 5], [6]])
    const saved = await loadVisionResult(dir.result)
    expect(saved?.model).toBe('claude-haiku-5-5')
    expect(saved?.shots.map((shot) => shot.shotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(saved?.shots[4]).toMatchObject({
      description: 'Shot 4 description',
      tags: ['outdoor']
    })
    expect((await ai.status()).usage.inputTokens).toBe(3000)
  })

  it('sends only frames as images, labelled by shot, with the prompt last', async () => {
    const requests: MessageRequest[] = []
    const ai = await readyService({ client: answeringClient(requests) })
    const dir = await clipFolder(2)

    await visionStageRunner(ai, { sleep: async () => undefined })(
      'clip.mp4',
      ctx,
      dir.frames,
      dir.result
    )

    expect(requests).toHaveLength(1)
    const images = requests[0].images ?? []
    expect(images.map((image) => image.label)).toEqual([
      'Shot 0',
      'Shot 0',
      'Shot 1',
      'Shot 1',
      'Shot 1'
    ])
    expect(Buffer.from(images[0].data, 'base64').toString()).toBe('frame-0-0')
    expect(requests[0].prompt).toContain('JSON array')
  })

  it('waits and tries again on a rate limit, using the Retry-After the server sent', async () => {
    let attempts = 0
    const ai = await readyService({
      client: {
        sendMessage: async (request) => {
          attempts += 1
          if (attempts === 1) {
            throw new AnthropicRequestError('limited', { retryable: true, retryAfterMs: 2500 })
          }
          return answeringClient().sendMessage(request)
        }
      }
    })
    const waits: number[] = []
    const dir = await clipFolder(2)

    const outcome = await visionStageRunner(ai, {
      sleep: async (ms) => {
        waits.push(ms)
      }
    })('clip.mp4', ctx, dir.frames, dir.result)

    expect(outcome).toBe('done')
    expect(attempts).toBe(2)
    expect(waits).toEqual([2500])
  })

  it('gives up after the last try, and keeps the shots already described', async () => {
    let calls = 0
    const ai = await readyService({
      client: {
        sendMessage: async (request) => {
          calls += 1
          // The first batch succeeds. Every try of the second batch is rate limited.
          if (calls === 1) return answeringClient().sendMessage(request)
          throw new AnthropicRequestError('limited', { retryable: true })
        }
      }
    })
    const waits: number[] = []
    const dir = await clipFolder(4)

    await expect(
      visionStageRunner(ai, {
        batchShots: 2,
        sleep: async (ms) => {
          waits.push(ms)
        }
      })('clip.mp4', ctx, dir.frames, dir.result)
    ).rejects.toMatchObject({ retryable: true })

    // One call for the first batch, then four tries of the second.
    expect(calls).toBe(5)
    expect(waits).toEqual([1000, 2000, 4000])
    const saved = await loadVisionResult(dir.result)
    expect(saved?.shots.map((shot) => shot.shotIndex)).toEqual([0, 1])
  })

  it('does not retry a refused key, and keeps earlier batches', async () => {
    let calls = 0
    const ai = await readyService({
      client: {
        sendMessage: async (request) => {
          calls += 1
          if (calls === 1) return answeringClient().sendMessage(request)
          throw new AnthropicRequestError('Anthropic did not accept this API key.', {
            retryable: false
          })
        }
      }
    })
    const waits: number[] = []
    const dir = await clipFolder(4)

    await expect(
      visionStageRunner(ai, {
        batchShots: 2,
        sleep: async (ms) => {
          waits.push(ms)
        }
      })('clip.mp4', ctx, dir.frames, dir.result)
    ).rejects.toThrow('did not accept this API key')

    expect(calls).toBe(2)
    expect(waits).toEqual([])
    expect((await loadVisionResult(dir.result))?.shots).toHaveLength(2)
  })

  it('a later run describes only the shots still missing', async () => {
    let fail = true
    const ai = await readyService({
      client: {
        sendMessage: async (request) => {
          if (fail && shotsIn(request).includes(2)) {
            throw new AnthropicRequestError('Anthropic did not accept this API key.', {
              retryable: false
            })
          }
          return answeringClient().sendMessage(request)
        }
      }
    })
    const dir = await clipFolder(4)
    const run = visionStageRunner(ai, { batchShots: 2, sleep: async () => undefined })
    await expect(run('clip.mp4', ctx, dir.frames, dir.result)).rejects.toBeInstanceOf(
      UserFacingError
    )

    fail = false
    const requests: MessageRequest[] = []
    const again = await readyService({ client: answeringClient(requests) })
    const outcome = await visionStageRunner(again, { batchShots: 2, sleep: async () => undefined })(
      'clip.mp4',
      ctx,
      dir.frames,
      dir.result
    )

    expect(outcome).toBe('done')
    expect(requests.map(shotsIn)).toEqual([[2, 3]])
    expect((await loadVisionResult(dir.result))?.shots.map((shot) => shot.shotIndex)).toEqual([
      0, 1, 2, 3
    ])
  })

  it('describes again from scratch when the model has changed since the saved run', async () => {
    const dir = await clipFolder(2)
    const first = await readyService({ client: answeringClient() })
    await visionStageRunner(first, { sleep: async () => undefined })(
      'clip.mp4',
      ctx,
      dir.frames,
      dir.result
    )

    const requests: MessageRequest[] = []
    const second = await readyService({ client: answeringClient(requests) })
    await second.updateSettings({ visionModel: 'claude-sonnet-5-5' })
    await visionStageRunner(second, { sleep: async () => undefined })(
      'clip.mp4',
      ctx,
      dir.frames,
      dir.result
    )

    expect(requests.map(shotsIn)).toEqual([[0, 1]])
    expect((await loadVisionResult(dir.result))?.model).toBe('claude-sonnet-5-5')
  })

  it('stops as skipped when the cap is reached between batches, keeping what was described', async () => {
    const requests: MessageRequest[] = []
    const ai = await readyService({
      cap: 0.05,
      client: {
        sendMessage: async (request) => {
          requests.push(request)
          return {
            text: JSON.stringify(
              shotsIn(request).map((shot) => ({ shot, description: 'd', tags: [] }))
            ),
            // Enough input tokens to pass the cap after one request.
            usage: { inputTokens: 1_000_000, outputTokens: 0 }
          }
        }
      }
    })
    const dir = await clipFolder(4)

    const outcome = await visionStageRunner(ai, {
      batchShots: 2,
      sleep: async () => undefined
    })('clip.mp4', ctx, dir.frames, dir.result)

    expect(outcome).toBe('skipped')
    expect(requests).toHaveLength(1)
    expect((await loadVisionResult(dir.result))?.shots).toHaveLength(2)
  })

  it('fails with a plain message when the reply cannot be read', async () => {
    const ai = await readyService({
      client: {
        sendMessage: async () => ({
          text: 'I am not able to do that.',
          usage: { inputTokens: 1, outputTokens: 1 }
        })
      }
    })
    const dir = await clipFolder(2)

    await expect(
      visionStageRunner(ai, { sleep: async () => undefined })(
        'clip.mp4',
        ctx,
        dir.frames,
        dir.result
      )
    ).rejects.toThrow('could not read')
  })

  it('fails when the reply leaves a shot out, so the record shows it', async () => {
    const ai = await readyService({
      client: {
        sendMessage: async (request) => {
          const first = shotsIn(request)[0]
          return {
            text: JSON.stringify([{ shot: first, description: 'only one', tags: [] }]),
            usage: { inputTokens: 1, outputTokens: 1 }
          }
        }
      }
    })
    const dir = await clipFolder(3)

    await expect(
      visionStageRunner(ai, { sleep: async () => undefined })(
        'clip.mp4',
        ctx,
        dir.frames,
        dir.result
      )
    ).rejects.toThrow('did not describe 2 shots')
  })

  it('finishes with nothing to do when the clip has no shots', async () => {
    const ai = await readyService({ client: answeringClient() })
    const dir = await clipFolder(0)

    await expect(visionStageRunner(ai)('clip.mp4', ctx, dir.frames, dir.result)).resolves.toBe(
      'done'
    )
  })
})
