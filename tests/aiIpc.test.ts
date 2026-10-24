import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { AiService } from '../src/main/ai/aiService'
import { memoryAiStateStorage } from '../src/main/ai/aiStateFile'
import type { SecretStore } from '../src/main/ai/secretStore'
import { JobQueue, type JobExecutors } from '../src/main/jobs/jobQueue'
import { emptyAnalysisFile, type AnalysisFile } from '@shared/analysis/analysis'

// No request leaves the test: the client is a fake, and the key lives in memory.
function memorySecrets(): SecretStore {
  let value: string | null = null
  return {
    isAvailable: () => true,
    read: async () => value,
    write: async (secret) => {
      value = secret
    },
    clear: async () => {
      value = null
    }
  }
}

function pendingForever(): JobExecutors {
  const never = () => new Promise<never>(() => undefined)
  return {
    probe: never,
    thumbs: never,
    filmstrip: never,
    proxy: never,
    analysis: never
  } as unknown as JobExecutors
}

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'ai-ipc-'))
  let analysisFile: AnalysisFile = emptyAnalysisFile()
  const ai = new AiService({
    secrets: memorySecrets(),
    state: memoryAiStateStorage(),
    createClient: () => ({
      sendMessage: async () => ({ inputTokens: 9, outputTokens: 2 })
    })
  })
  const handlers = createIpcHandlers({
    layoutFile: join(folder, 'ui-layout.json'),
    recentFile: join(folder, 'recent-projects.json'),
    jobs: new JobQueue(pendingForever()),
    analysisStorage: {
      load: async () => analysisFile,
      save: async (_folder, file) => {
        analysisFile = file
      }
    },
    ai
  })
  const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
  return { folder, api }
}

const KEY = 'sk-ant-test-0000000000000000000000'

describe('AI IPC round trip', () => {
  it('ai:status reports no key and the default settings', async () => {
    const { api } = setup()
    const result = await api.invoke('ai:status', {})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.hasKey).toBe(false)
    expect(result.data.settings).toEqual({
      visionModel: 'claude-haiku-5-5',
      monthlySpendCapUsd: null
    })
    expect(result.data.capStatus).toBe('uncapped')
  })

  it('ai:settings:update changes the model and the cap', async () => {
    const { api } = setup()
    const result = await api.invoke('ai:settings:update', {
      visionModel: 'claude-sonnet-5-5',
      monthlySpendCapUsd: 12.5
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.settings).toEqual({
      visionModel: 'claude-sonnet-5-5',
      monthlySpendCapUsd: 12.5
    })
  })

  it('ai:settings:update rejects a cap above the limit and an unknown model', async () => {
    const { api } = setup()
    const tooHigh = await api.invoke('ai:settings:update', { monthlySpendCapUsd: 1_000_000 })
    const unknown = await api.invoke('ai:settings:update', { visionModel: 'gpt-4' as never })

    expect(tooHigh).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(unknown).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })

  it('ai:key:save stores the key and replies with status only', async () => {
    const { api } = setup()
    const result = await api.invoke('ai:key:save', { apiKey: KEY })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.hasKey).toBe(true)
    expect(JSON.stringify(result.data)).not.toContain(KEY)
  })

  it('ai:key:save rejects a key that is too short or has spaces', async () => {
    const { api } = setup()
    const short = await api.invoke('ai:key:save', { apiKey: 'sk-short' })
    const spaced = await api.invoke('ai:key:save', { apiKey: 'sk-ant with spaces in it 0000' })

    expect(short).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    expect(spaced).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })

  it('ai:key:test sends one request and reports the result in plain words', async () => {
    const { api } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:key:test', {})

    expect(result).toEqual({ ok: true, data: { ok: true, message: 'Connected. The key works.' } })
  })

  it('ai:key:clear removes the saved key', async () => {
    const { api } = setup()
    await api.invoke('ai:key:save', { apiKey: KEY })
    const result = await api.invoke('ai:key:clear', {})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.hasKey).toBe(false)
  })

  it('ai:vision:estimate prices the shots against the cap', async () => {
    const { api } = setup()
    const result = await api.invoke('ai:vision:estimate', { shotCount: 25 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      model: 'claude-haiku-5-5',
      shotCount: 25,
      remainingUsd: null
    })
    expect(result.data.estimateUsd).toBeGreaterThan(0)
  })

  it('ai:vision:estimate rejects a negative shot count', async () => {
    const { api } = setup()
    const result = await api.invoke('ai:vision:estimate', { shotCount: -1 })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })

  it('analysis:visionDecision records the answer for the project', async () => {
    const { folder, api } = setup()
    const result = await api.invoke('analysis:visionDecision', {
      projectFolder: folder,
      decision: 'skipped'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.file.visionDecision).toBe('skipped')
  })

  it('analysis:visionDecision rejects an unknown answer', async () => {
    const { folder, api } = setup()
    const result = await api.invoke('analysis:visionDecision', {
      projectFolder: folder,
      decision: 'maybe' as never
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
  })
})
