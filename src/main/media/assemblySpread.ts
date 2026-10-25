// Runs the footage matches of one assembly batch in order, so each match sees the cuts the ones before it
// chose (Epic 16, #146). The spread is held in memory. When a batch has no spread yet (after a restart), the
// caller seeds it with the ranges its saved plans use (#254). No Electron imports here, so the job executor
// and the tests share it.
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import type { UsedRange } from '@shared/assembly/footageSpread'
import { UserFacingError } from '../errors'

export interface AssemblyRunInput {
  footage: FootageMatchRequest
  /** Ignore the footage earlier items used, so this match may reuse it. */
  reuse: boolean
  /** Ranges the batch already uses, applied only when the batch has no spread in memory yet. */
  seed?: readonly UsedRange[]
}

export interface AssemblySpreadOptions<T> {
  /** Matches one request, avoiding the given used ranges. */
  match: (footage: FootageMatchRequest, used: readonly UsedRange[]) => Promise<T>
  /** The ranges a match result used, so later matches in the batch avoid them. */
  usedOf: (result: T) => readonly UsedRange[]
}

interface Spread {
  chain: Promise<unknown>
  used: UsedRange[]
}

export interface AssemblySpreads<T> {
  run(batchId: string, input: AssemblyRunInput, signal: AbortSignal): Promise<T>
}

export function createAssemblySpreads<T>(options: AssemblySpreadOptions<T>): AssemblySpreads<T> {
  const spreads = new Map<string, Spread>()

  function spreadFor(batchId: string, seed: readonly UsedRange[]): Spread {
    let spread = spreads.get(batchId)
    if (!spread) {
      spread = { chain: Promise.resolve(), used: [...seed] }
      spreads.set(batchId, spread)
    }
    return spread
  }

  return {
    run(batchId, input, signal) {
      const spread = spreadFor(batchId, input.seed ?? [])
      // Each match waits for the ones before it in the batch, so it sees the cuts they chose.
      const run = spread.chain.then(async () => {
        if (signal.aborted) throw new UserFacingError('Footage matching was cancelled.')
        const result = await options.match(input.footage, input.reuse ? [] : spread.used)
        spread.used = [...spread.used, ...options.usedOf(result)]
        return result
      })
      spread.chain = run.catch(() => undefined)
      return run
    }
  }
}
