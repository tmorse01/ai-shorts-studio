// Asks main to match a script's lines to footage. A failure shows a toast and returns null.
import type {
  FootageMatchRequest,
  FootageMatchResultData
} from '@shared/assembly/footageMatchRequest'
import type { RendererInvokeApi } from '@shared/ipc'
import { toast } from '../toasts/toast'

export async function matchScriptFootage(
  api: RendererInvokeApi,
  request: FootageMatchRequest
): Promise<FootageMatchResultData | null> {
  const result = await api.invoke('ai:footage:match', request)
  if (result.ok) return result.data
  toast.error({
    title: 'Could not match the footage',
    description: result.error.message,
    details: result.error.details
  })
  return null
}
