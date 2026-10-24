// Moving between shorts in the editor. The switch waits for pending edits to be written, and it stays
// on the current short when that write fails, so no edit is left behind. Pure apart from the injected
// dependencies, so the tests can drive it without a router or a store.
import type { Short, ShortStatus } from '@shared/project/schema'
import { sortShorts } from './shortsView'

const STATUS_LABEL: Record<ShortStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  exported: 'Exported'
}

export interface SwitcherEntry {
  id: string
  name: string
  status: ShortStatus
  statusLabel: string
}

// Every short of the project in grid order (the manual sort), with its status for the chip.
export function switcherEntries(shorts: readonly Short[]): SwitcherEntry[] {
  return sortShorts(shorts, 'manual', () => 0).map((short) => ({
    id: short.id,
    name: short.name,
    status: short.status,
    statusLabel: STATUS_LABEL[short.status]
  }))
}

export interface SwitchDeps {
  // Writes pending edits and resolves when the write has finished or failed.
  flush: () => Promise<void>
  // True when the last write failed.
  hasSaveError: () => boolean
  navigate: (shortId: string) => void
  onSaveFailed: () => void
}

// Resolves true when the editor moved to the target short. Choosing the short that is already open
// does nothing.
export async function switchToShort(
  currentShortId: string | undefined,
  nextShortId: string,
  deps: SwitchDeps
): Promise<boolean> {
  if (nextShortId === currentShortId) return false
  await deps.flush()
  if (deps.hasSaveError()) {
    deps.onSaveFailed()
    return false
  }
  deps.navigate(nextShortId)
  return true
}
