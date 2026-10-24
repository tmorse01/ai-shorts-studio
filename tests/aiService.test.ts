import { describe, expect, it } from 'vitest'
import {
  estimateVisionCost,
  emptyAiStateFile,
  type AiStateFile,
  type AiStatus
} from '@shared/ai/aiSettings'
import { AiService } from '../src/main/ai/aiService'
import type { AnthropicClient, MessageRequest } from '../src/main/ai/anthropicClient'
import type { AiStateStorage } from '../src/main/ai/aiStateFile'
import type { SecretStore } from '../src/main/ai/secretStore'
import { UserFacingError } from '../src/main/errors'

const KEY = 'sk-ant-test-0000000000000000000000'

// A key store that keeps the secret in memory, so no file or keychain is touched.
function fakeSecrets(initial: string | null = null, available = true) {
  let value = initial
  const store: SecretStore = {
    isAvailable: () => available,
    read: async () => value,
    write: async (secret) => {
      if (!available) throw new UserFacingError('Secure storage is not available.')
      value = secret
    },
    clear: async () => {
      value = null
    }
  }
  return { store, peek: () => value }
}

// A client that never leaves the test. It records each request and replies with fixed usage.
function fakeClient(
  reply: () => Promise<{ inputTokens: number; outputTokens: number }> = async () => ({
    inputTokens: 12,
    outputTokens: 3
  })
) {
  const requests: MessageRequest[] = []
  const keysUsed: string[] = []
  const client: AnthropicClient = {
    sendMessage: async (request) => {
      requests.push(request)
      return reply()
    }
  }
  const createClient = (key: string): AnthropicClient => {
    keysUsed.push(key)
    return client
  }
  return { requests, keysUsed, createClient }
}

function memoryState(
  initial: AiStateFile = emptyAiStateFile()
): AiStateStorage & { saved: AiStateFile[] } {
  let stored = initial
  const saved: AiStateFile[] = []
  return {
    saved,
    load: async () => stored,
    save: async (state) => {
      stored = state
      saved.push(state)
    }
  }
}

function setup(
  options: { key?: string | null; available?: boolean; now?: Date; state?: AiStateFile } = {}
) {
  const secrets = fakeSecrets(options.key ?? null, options.available ?? true)
  const client = fakeClient()
  const changes: AiStatus[] = []
  const state = memoryState(options.state)
  let clock = options.now ?? new Date('2026-10-15T12:00:00Z')
  const service = new AiService({
    secrets: secrets.store,
    state,
    createClient: client.createClient,
    now: () => clock,
    onChange: (status) => changes.push(status)
  })
  return {
    service,
    secrets,
    client,
    changes,
    state,
    setNow: (next: Date) => (clock = next)
  }
}

describe('AiService without a key', () => {
  it('reports no key, blocks vision, and never builds a client', async () => {
    const { service, client } = setup()
    const status = await service.status()

    expect(status.hasKey).toBe(false)
    expect(service.visionAvailability()).toBe('no-key')
    await expect(service.client()).rejects.toThrow('Add an Anthropic API key')
    expect(client.keysUsed).toEqual([])
  })

  it('fails the connection test with a plain message and sends nothing', async () => {
    const { service, client } = setup()
    expect(await service.testKey()).toEqual({ ok: false, message: 'Save an API key first.' })
    expect(client.requests).toEqual([])
  })
})

describe('saving and clearing the key', () => {
  it('stores the key in the secret store and never returns it in status', async () => {
    const { service, secrets } = setup()
    const status = await service.saveKey(KEY)

    expect(secrets.peek()).toBe(KEY)
    expect(status.hasKey).toBe(true)
    expect(service.visionAvailability()).toBe('ready')
    expect(JSON.stringify(status)).not.toContain(KEY)
  })

  it('surfaces a plain error when secure storage is unavailable', async () => {
    const { service, secrets } = setup({ available: false })
    await expect(service.saveKey(KEY)).rejects.toThrow('Secure storage is not available')
    expect(secrets.peek()).toBeNull()
    expect((await service.status()).keyStorageAvailable).toBe(false)
  })

  it('clears the key', async () => {
    const { service, secrets } = setup({ key: KEY })
    const status = await service.clearKey()
    expect(secrets.peek()).toBeNull()
    expect(status.hasKey).toBe(false)
  })
})

describe('connection test and usage', () => {
  it('sends one small request and records the usage the API reported', async () => {
    const { service, client } = setup({ key: KEY })
    const result = await service.testKey()

    expect(result).toEqual({ ok: true, message: 'Connected. The key works.' })
    expect(client.requests).toHaveLength(1)
    expect(client.requests[0].maxTokens).toBeLessThanOrEqual(16)
    const status = await service.status()
    expect(status.usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      costUsd: expect.any(Number)
    })
    expect(status.usage.costUsd).toBeGreaterThan(0)
  })

  it('reports a rejected key in plain words', async () => {
    const secrets = fakeSecrets(KEY)
    const service = new AiService({
      secrets: secrets.store,
      state: memoryState(),
      createClient: () => ({
        sendMessage: async () => {
          throw new UserFacingError('Anthropic did not accept this API key.')
        }
      })
    })
    expect(await service.testKey()).toEqual({
      ok: false,
      message: 'Anthropic did not accept this API key.'
    })
  })

  it('adds usage for every recorded request, from the reported tokens', async () => {
    const { service, changes } = setup({ key: KEY })
    await service.recordUsage('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })
    const status = await service.recordUsage('claude-haiku-5-5', {
      inputTokens: 0,
      outputTokens: 1_000_000
    })

    expect(status.usage.inputTokens).toBe(1_000_000)
    expect(status.usage.outputTokens).toBe(1_000_000)
    expect(status.usage.costUsd).toBeCloseTo(0.6, 6)
    expect(changes.at(-1)).toEqual(status)
  })
})

describe('monthly cap', () => {
  it('pauses vision once the month reaches the cap, and resumes when it is raised', async () => {
    const { service } = setup({ key: KEY })
    await service.updateSettings({ monthlySpendCapUsd: 1 })
    await service.recordUsage('claude-haiku-5-5', { inputTokens: 10_000_000, outputTokens: 0 })

    expect((await service.status()).capStatus).toBe('reached')
    expect(service.visionAvailability()).toBe('capped')

    await service.updateSettings({ monthlySpendCapUsd: 5 })
    expect(service.visionAvailability()).toBe('ready')
  })

  it('starts the count over in a new month', async () => {
    const { service, setNow } = setup({ key: KEY, now: new Date('2026-10-30T23:00:00Z') })
    await service.updateSettings({ monthlySpendCapUsd: 1 })
    await service.recordUsage('claude-haiku-5-5', { inputTokens: 10_000_000, outputTokens: 0 })
    expect(service.visionAvailability()).toBe('capped')

    setNow(new Date('2026-12-02T12:00:00Z'))
    const status = await service.status()
    expect(status.month).toBe('2026-12')
    expect(status.usage.costUsd).toBe(0)
    expect(service.visionAvailability()).toBe('ready')
  })

  it('removes the cap when set to null', async () => {
    const { service } = setup({ key: KEY })
    await service.updateSettings({ monthlySpendCapUsd: 2 })
    const status = await service.updateSettings({ monthlySpendCapUsd: null })
    expect(status.settings.monthlySpendCapUsd).toBeNull()
    expect(status.capStatus).toBe('uncapped')
  })
})

describe('settings and estimates', () => {
  it('switches the vision model and keeps the cap', async () => {
    const { service } = setup()
    await service.updateSettings({ monthlySpendCapUsd: 3 })
    const status = await service.updateSettings({ visionModel: 'claude-sonnet-5-5' })
    expect(status.settings).toEqual({ visionModel: 'claude-sonnet-5-5', monthlySpendCapUsd: 3 })
    expect(service.visionModel()).toBe('claude-sonnet-5-5')
  })

  it('estimates a vision pass from the shot count and the cap left', async () => {
    const { service } = setup({ key: KEY })
    const estimate = await service.estimateVision(40)
    expect(estimate.model).toBe('claude-haiku-5-5')
    expect(estimate.estimateUsd).toBe(estimateVisionCost('claude-haiku-5-5', 40))
    expect(estimate.remainingUsd).toBeNull()

    await service.updateSettings({ monthlySpendCapUsd: 10 })
    expect((await service.estimateVision(40)).remainingUsd).toBe(10)
  })

  it('loads saved settings, usage and key presence on ready', async () => {
    const saved: AiStateFile = {
      settings: { visionModel: 'claude-sonnet-5-5', monthlySpendCapUsd: 4 },
      usage: [
        {
          at: new Date('2026-10-10T10:00:00Z').toISOString(),
          model: 'claude-sonnet-5-5',
          inputTokens: 500,
          outputTokens: 50,
          costUsd: 0.0013
        }
      ]
    }
    const { service } = setup({ key: KEY, state: saved })
    await service.ready()

    expect(service.visionModel()).toBe('claude-sonnet-5-5')
    expect(service.visionAvailability()).toBe('ready')
    expect((await service.status()).usage.costUsd).toBe(0.0013)
  })
})
