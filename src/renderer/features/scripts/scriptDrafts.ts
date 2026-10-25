// Talks to main for AI script drafts: the cost estimate before a run, and the run itself. Turning the
// drafts into scripts (with fresh ids) happens here too, so the caller can save them as one command.
import type { LineRewriteInput } from '@shared/ai/lineRewrite'
import type { GeneratedScript, ScriptEstimate, ScriptRunInput } from '@shared/ai/scriptGeneration'
import type { Script } from '@shared/project/schema'
import type { RendererInvokeApi } from '@shared/ipc'
import { toast } from '../toasts/toast'

/** The cost of one run, for the dialog's second step. Null after a shown error. */
export async function estimateScriptDrafts(
  api: RendererInvokeApi,
  input: ScriptRunInput
): Promise<ScriptEstimate | null> {
  const result = await api.invoke('ai:scripts:estimate', input)
  if (result.ok) return result.data
  toast.error({
    title: 'Could not estimate the cost',
    description: result.error.message,
    details: result.error.details
  })
  return null
}

/**
 * Starts a persisted batch that drafts one script per item (#145). Each item is a one-script request
 * with the same footage and brief. Returns whether the batch started. The drafts are imported when
 * their items finish.
 */
export async function startScriptBatch(
  api: RendererInvokeApi,
  input: ScriptRunInput,
  count: number
): Promise<boolean> {
  const items = Array.from({ length: count }, () => ({
    id: `script-${crypto.randomUUID()}`,
    request: { ...input, request: { ...input.request, count: 1 } }
  }))
  const result = await api.invoke('batch:run', { projectFolder: input.projectFolder, items })
  if (result.ok) return true
  toast.error({
    title: 'Could not start the script batch',
    description: result.error.message,
    details: result.error.details
  })
  return false
}

/** Drafts the scripts. Null after a shown error. */
export async function draftScripts(
  api: RendererInvokeApi,
  input: ScriptRunInput
): Promise<GeneratedScript[] | null> {
  const result = await api.invoke('ai:scripts:generate', input)
  if (result.ok) return result.data.scripts
  toast.error({
    title: 'Could not draft the scripts',
    description: result.error.message,
    details: result.error.details
  })
  return null
}

/** Gives every script and line a fresh id, ready to save. The ids come from `newId`, so tests can fix them. */
export function scriptsFromDrafts(
  drafts: readonly GeneratedScript[],
  newId: () => string = () => crypto.randomUUID()
): Script[] {
  return drafts.map((draft) => ({
    id: newId(),
    title: draft.title,
    topic: draft.topic,
    lines: draft.lines.map((line) => ({
      id: newId(),
      text: line.text,
      ...(line.beat ? { beat: line.beat } : {}),
      ...(line.footageHints && line.footageHints.length > 0
        ? { footageHints: line.footageHints }
        : {})
    }))
  }))
}

/** Rewrites one line as the chosen action asks. Null after a shown error. */
export async function rewriteLine(
  api: RendererInvokeApi,
  input: LineRewriteInput
): Promise<string | null> {
  const result = await api.invoke('ai:scripts:rewriteLine', input)
  if (result.ok) return result.data.text
  toast.error({
    title: 'Could not rewrite the line',
    description: result.error.message,
    details: result.error.details
  })
  return null
}
