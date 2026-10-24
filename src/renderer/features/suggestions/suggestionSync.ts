// Talks to main about one clip's AI suggestions: reading them, asking for moments, and dismissing. Each call
// takes the api as a parameter, so the logic can be tested with a fake. Failures show as a toast, except a
// failed read, which simply shows no suggestions.
import type { SuggestionsOutput } from '@shared/analysis/suggestions'
import type { RendererInvokeApi } from '@shared/ipc'
import type { MediaRef } from '@shared/project/schema'
import { toast } from '../toasts/toast'

export async function readSuggestions(
  api: RendererInvokeApi,
  folderPath: string,
  mediaId: string
): Promise<SuggestionsOutput | null> {
  const result = await api.invoke('analysis:suggestions:read', {
    projectFolder: folderPath,
    mediaId
  })
  return result.ok ? result.data : null
}

/** Asks Claude for candidate moments of one clip. Null after a shown error. */
export async function findMoments(
  api: RendererInvokeApi,
  folderPath: string,
  ref: MediaRef
): Promise<SuggestionsOutput | null> {
  const result = await api.invoke('analysis:suggestions:findMoments', {
    projectFolder: folderPath,
    mediaId: ref.id,
    fileName: ref.fileName,
    durationMs: ref.durationMs
  })
  if (result.ok) return result.data
  toast.error({
    title: 'Could not find moments',
    description: result.error.message,
    details: result.error.details
  })
  return null
}

/** Dismisses suggestions by key. Null after a shown error. */
export async function dismissSuggestions(
  api: RendererInvokeApi,
  folderPath: string,
  mediaId: string,
  keys: readonly string[]
): Promise<SuggestionsOutput | null> {
  const result = await api.invoke('analysis:suggestions:dismiss', {
    projectFolder: folderPath,
    mediaId,
    keys: [...keys]
  })
  if (result.ok) return result.data
  toast.error({
    title: 'Could not dismiss the suggestion',
    description: result.error.message,
    details: result.error.details
  })
  return null
}
