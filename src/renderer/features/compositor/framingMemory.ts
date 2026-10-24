// The last framing used on each source in this session. A new cut from a source starts from it (see
// framingForNewCut in shared/timeline/framing.ts). It is per-viewer memory, not project data, so it
// lives in a plain map and is not saved with the project.
import type { ClipFraming } from '@shared/timeline/framing'

const lastBySource = new Map<string, ClipFraming>()

export function rememberFraming(mediaId: string, framing: ClipFraming): void {
  lastBySource.set(mediaId, { ...framing, panTo: framing.panTo ? { ...framing.panTo } : undefined })
}

export function lastFramingFor(mediaId: string): ClipFraming | undefined {
  return lastBySource.get(mediaId)
}

export function clearFramingMemory(): void {
  lastBySource.clear()
}
