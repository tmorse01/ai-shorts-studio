// Talks to main about cloud AI: loading the status, saving or clearing the key, testing it, changing the
// settings, and toasting when the monthly cap pauses vision. Every call takes the api as a parameter, so
// the logic can be tested with a fake. The key is sent to main once and never comes back.
import type { AiStatus, VisionEstimate, VisionModel } from '@shared/ai/aiSettings'
import type { RendererApi, RendererInvokeApi, Unsubscribe } from '@shared/ipc'
import { toast } from '../toasts/toast'
import { aiStore } from './aiStore'

function apply(status: AiStatus): AiStatus {
  aiStore.getState().setStatus(status)
  return status
}

/** Loads the status into the store. */
export async function refreshAiStatus(api: RendererInvokeApi): Promise<void> {
  const result = await api.invoke('ai:status', {})
  if (result.ok) apply(result.data)
  else toast.error({ title: 'Could not load AI settings', description: result.error.message })
}

export async function updateAiSettings(
  api: RendererInvokeApi,
  patch: { visionModel?: VisionModel; monthlySpendCapUsd?: number | null }
): Promise<void> {
  const result = await api.invoke('ai:settings:update', patch)
  if (result.ok) apply(result.data)
  else toast.error({ title: 'Could not save AI settings', description: result.error.message })
}

/** Saves the key. Resolves true when it was saved. The key is not kept in the store. */
export async function saveAiKey(api: RendererInvokeApi, apiKey: string): Promise<boolean> {
  const result = await api.invoke('ai:key:save', { apiKey })
  if (result.ok) {
    apply(result.data)
    return true
  }
  toast.error({
    title: 'Could not save the key',
    description: result.error.message,
    details: result.error.details
  })
  return false
}

export async function clearAiKey(api: RendererInvokeApi): Promise<void> {
  const result = await api.invoke('ai:key:clear', {})
  if (result.ok) apply(result.data)
  else toast.error({ title: 'Could not remove the key', description: result.error.message })
}

/** One small request with the saved key. Returns the message to show next to the button. */
export async function testAiKey(api: RendererInvokeApi): Promise<{ ok: boolean; message: string }> {
  const result = await api.invoke('ai:key:test', {})
  if (!result.ok) return { ok: false, message: result.error.message }
  // The test's usage is counted, so the readout is refreshed too.
  await refreshAiStatus(api)
  return result.data
}

/** The cost of a vision pass over a number of shots, for the cost dialog. */
export async function estimateVisionPass(
  api: RendererInvokeApi,
  shotCount: number
): Promise<VisionEstimate | null> {
  const result = await api.invoke('ai:vision:estimate', { shotCount })
  if (result.ok) return result.data
  toast.error({ title: 'Could not estimate the cost', description: result.error.message })
  return null
}

/**
 * Mirrors main's status and toasts once when the monthly cap is reached, which pauses vision. A status
 * that arrives when the cap was already reached does not toast again.
 */
export function watchAi(api: Pick<RendererApi, 'on'>): Unsubscribe {
  return api.on('ai:changed', ({ status }) => {
    const previous = aiStore.getState().status
    apply(status)
    if (previous && previous.capStatus !== 'reached' && status.capStatus === 'reached') {
      toast.ai({
        title: 'Vision paused: monthly spend cap reached',
        description: 'Raise the cap in Settings, or wait for next month, to describe footage again.'
      })
    }
  })
}
