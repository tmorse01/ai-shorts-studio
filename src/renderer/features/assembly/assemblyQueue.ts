// Runs footage matching for several scripts, one after another (#145). A queued match only fills in the
// plan the review panel shows (#139). Nothing reaches a short here: the user reviews and applies it there.
// Pure orchestration, so the order and the states are tested with fake matchers.
import type {
  FootageMatchRequest,
  FootageMatchResultData
} from '@shared/assembly/footageMatchRequest'

export type AssemblyPlanState =
  | { status: 'queued' }
  | { status: 'running' }
  | { status: 'ready'; result: FootageMatchResultData }
  | { status: 'failed'; message: string }

export interface AssemblyQueueDeps {
  /** The match request for a script, or null when it has no lines to match. */
  requestFor: (scriptId: string) => FootageMatchRequest | null
  /** Runs one match. Null when it failed; the failure has already been shown. */
  match: (request: FootageMatchRequest) => Promise<FootageMatchResultData | null>
  report: (scriptId: string, state: AssemblyPlanState) => void
}

export async function runAssemblyQueue(
  scriptIds: readonly string[],
  deps: AssemblyQueueDeps
): Promise<void> {
  for (const scriptId of scriptIds) {
    const request = deps.requestFor(scriptId)
    if (!request) {
      deps.report(scriptId, {
        status: 'failed',
        message: 'Write some lines before matching footage.'
      })
      continue
    }
    deps.report(scriptId, { status: 'running' })
    let result: FootageMatchResultData | null = null
    try {
      result = await deps.match(request)
    } catch {
      result = null
    }
    deps.report(
      scriptId,
      result
        ? { status: 'ready', result }
        : { status: 'failed', message: 'The footage could not be matched.' }
    )
  }
}

/** The short status text a script row shows for its footage plan. Null when nothing is queued. */
export function assemblyStatusLabel(state: AssemblyPlanState | undefined): string | null {
  if (!state) return null
  switch (state.status) {
    case 'queued':
      return 'Footage queued'
    case 'running':
      return 'Matching footage'
    case 'ready':
      return 'Footage ready to review'
    case 'failed':
      return 'Footage not matched'
  }
}
