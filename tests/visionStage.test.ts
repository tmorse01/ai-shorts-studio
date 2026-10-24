import { describe, expect, it } from 'vitest'
import { defaultAiSettings, emptyAiStateFile } from '@shared/ai/aiSettings'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import { visionStageRunner, type VisionDescriber } from '../src/main/ai/visionStage'
import type { SecretStore } from '../src/main/ai/secretStore'
import type { JobContext } from '../src/main/jobs/jobQueue'

const KEY = 'sk-ant-test-0000000000000000000000'
const ctx = {
  signal: new AbortController().signal,
  reportProgress: () => undefined
} as unknown as JobContext

function serviceWith(options: { key: boolean; cap?: number | null }) {
  let value: string | null = options.key ? KEY : null
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
  return new AiService({
    secrets,
    state,
    createClient: () => ({
      sendMessage: async () => ({ inputTokens: 1, outputTokens: 1 })
    })
  })
}

describe('vision stage runner', () => {
  it('skips when no describer is set up yet, even with a key', async () => {
    const ai = serviceWith({ key: true })
    await ai.ready()
    const run = visionStageRunner(ai)

    await expect(run('clip.mp4', ctx, '/out')).resolves.toBe('skipped')
  })

  it('skips without a key and never calls the describer', async () => {
    const ai = serviceWith({ key: false })
    await ai.ready()
    let called = false
    const describe: VisionDescriber = async () => {
      called = true
      return { inputTokens: 1, outputTokens: 1 }
    }

    await expect(visionStageRunner(ai, describe)('clip.mp4', ctx, '/out')).resolves.toBe('skipped')
    expect(called).toBe(false)
  })

  it('skips when the monthly cap has already been reached', async () => {
    const ai = serviceWith({ key: true, cap: 0.5 })
    await ai.ready()
    await ai.recordUsage('claude-haiku-5-5', { inputTokens: 10_000_000, outputTokens: 0 })
    let called = false
    const describe: VisionDescriber = async () => {
      called = true
      return { inputTokens: 1, outputTokens: 1 }
    }

    await expect(visionStageRunner(ai, describe)('clip.mp4', ctx, '/out')).resolves.toBe('skipped')
    expect(called).toBe(false)
  })

  it('records the usage the describer reports, with the model the user chose', async () => {
    const ai = serviceWith({ key: true })
    await ai.ready()
    await ai.updateSettings({ visionModel: 'claude-sonnet-5-5' })
    const seen: string[] = []
    const describe: VisionDescriber = async ({ model, path }) => {
      seen.push(`${model}:${path}`)
      return { inputTokens: 2000, outputTokens: 150 }
    }

    await expect(visionStageRunner(ai, describe)('clip.mp4', ctx, '/out')).resolves.toBe('done')
    expect(seen).toEqual(['claude-sonnet-5-5:clip.mp4'])
    const status = await ai.status()
    expect(status.usage).toMatchObject({ inputTokens: 2000, outputTokens: 150 })
    expect(status.usage.costUsd).toBeGreaterThan(0)
  })
})
