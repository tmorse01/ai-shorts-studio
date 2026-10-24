// Owns the cloud AI state in main: the vision model, the monthly cap, the saved key (through the secret
// store) and the usage that each API reply reports. Every rule that decides cost or availability lives in
// @shared/ai/aiSettings; this class wires those rules to the key, the disk and the API client. The
// renderer gets status only, never the key.
import {
  capStatus,
  costForUsage,
  defaultAiSettings,
  DEFAULT_VISION_MODEL,
  estimateVisionCost,
  monthKey,
  remainingUnderCap,
  usageForMonth,
  visionAvailabilityFor,
  type AiStateFile,
  type AiStatus,
  type CapStatus,
  type TokenUsage,
  type UsageRecord,
  type VisionAvailability,
  type VisionEstimate,
  type VisionModel
} from '@shared/ai/aiSettings'
import { UserFacingError } from '../errors'
import { logError } from '../errors/errorLog'
import type { AnthropicClient } from './anthropicClient'
import type { AiStateStorage } from './aiStateFile'
import type { SecretStore } from './secretStore'

export interface AiServiceOptions {
  secrets: SecretStore
  state: AiStateStorage
  /** Builds the API client for a key. Tests pass a fake, so no request leaves the machine. */
  createClient: (apiKey: string) => AnthropicClient
  now?: () => Date
  /** Told after every change. The app forwards it to the renderer. */
  onChange?: (status: AiStatus) => void
}

export interface SettingsPatch {
  visionModel?: VisionModel
  monthlySpendCapUsd?: number | null
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export class AiService {
  private state: AiStateFile = { settings: defaultAiSettings(), usage: [] }
  private hasKey = false
  private loading: Promise<void> | undefined
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly options: AiServiceOptions) {}

  /**
   * Loads the saved settings, usage and whether a key is saved. The app awaits this once at startup,
   * so the vision gate can answer without waiting on the disk.
   */
  ready(): Promise<void> {
    this.loading ??= this.load()
    return this.loading
  }

  async status(): Promise<AiStatus> {
    await this.ready()
    return this.snapshot()
  }

  /** Whether vision may run now. Synchronous, for the analysis queue's gate. Call ready() first. */
  visionAvailability(): VisionAvailability {
    return visionAvailabilityFor(this.hasKey, this.capNow())
  }

  /** The vision model the user picked. */
  visionModel(): VisionModel {
    return this.state.settings.visionModel
  }

  async updateSettings(patch: SettingsPatch): Promise<AiStatus> {
    await this.ready()
    const settings = { ...this.state.settings }
    if (patch.visionModel !== undefined) settings.visionModel = patch.visionModel
    if (patch.monthlySpendCapUsd !== undefined) {
      settings.monthlySpendCapUsd = patch.monthlySpendCapUsd
    }
    this.state = { ...this.state, settings }
    return this.commit()
  }

  /** Saves the key in the OS-encrypted secret store. Throws when secure storage is unavailable. */
  async saveKey(apiKey: string): Promise<AiStatus> {
    await this.ready()
    await this.options.secrets.write(apiKey)
    this.hasKey = true
    return this.commit()
  }

  async clearKey(): Promise<AiStatus> {
    await this.ready()
    await this.options.secrets.clear()
    this.hasKey = false
    return this.commit()
  }

  /** One small request with the saved key. Its reported usage is recorded like any other request. */
  async testKey(): Promise<KeyTestResult> {
    await this.ready()
    if (!this.hasKey) return { ok: false, message: 'Save an API key first.' }
    try {
      const client = await this.client()
      const model = DEFAULT_VISION_MODEL
      const usage = await client.sendMessage({
        model,
        maxTokens: 8,
        prompt: 'Reply with the word OK.'
      })
      await this.recordUsage(model, usage)
      return { ok: true, message: 'Connected. The key works.' }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof UserFacingError ? error.message : 'The connection test failed.'
      }
    }
  }

  /** The API client for the saved key. Fails with a plain message when no key is saved. */
  async client(): Promise<AnthropicClient> {
    await this.ready()
    const key = await this.options.secrets.read()
    if (!key) {
      this.hasKey = false
      throw new UserFacingError('Add an Anthropic API key in Settings first.')
    }
    return this.options.createClient(key)
  }

  /** Adds one request's reported token usage and its cost to this month's record. */
  async recordUsage(model: VisionModel, usage: TokenUsage): Promise<AiStatus> {
    await this.ready()
    const now = this.now()
    const record: UsageRecord = {
      at: now.toISOString(),
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costForUsage(model, usage)
    }
    // Usage from earlier months is not shown or needed, so it is dropped as the month changes.
    const month = monthKey(now)
    const kept = this.state.usage.filter((item) => monthKey(new Date(item.at)) === month)
    this.state = { ...this.state, usage: [...kept, record] }
    return this.commit()
  }

  /** The cost of a vision pass over this many shots, against the cap. */
  async estimateVision(shotCount: number): Promise<VisionEstimate> {
    const status = await this.status()
    const model = status.settings.visionModel
    return {
      model,
      shotCount,
      estimateUsd: estimateVisionCost(model, shotCount),
      remainingUsd: remainingUnderCap(status.usage.costUsd, status.settings.monthlySpendCapUsd),
      capStatus: status.capStatus
    }
  }

  private async load(): Promise<void> {
    this.state = await this.options.state.load()
    this.hasKey = (await this.options.secrets.read()) !== null
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private capNow(): CapStatus {
    const spent = usageForMonth(this.state.usage, monthKey(this.now())).costUsd
    return capStatus(spent, this.state.settings.monthlySpendCapUsd)
  }

  private snapshot(): AiStatus {
    const month = monthKey(this.now())
    const usage = usageForMonth(this.state.usage, month)
    return {
      settings: { ...this.state.settings },
      hasKey: this.hasKey,
      keyStorageAvailable: this.options.secrets.isAvailable(),
      month,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd
      },
      capStatus: this.capNow()
    }
  }

  // Emits the new status and saves the state, one write after another so the last change wins.
  private commit(): AiStatus {
    const status = this.snapshot()
    this.options.onChange?.(status)
    const state = this.state
    this.writes = this.writes
      .then(() => this.options.state.save(state))
      .catch((error: unknown) => {
        logError({
          occurredAt: new Date().toISOString(),
          source: 'main',
          context: 'ai',
          summary: `Could not save AI settings: ${
            error instanceof Error ? error.message : String(error)
          }`
        })
      })
    return status
  }
}
