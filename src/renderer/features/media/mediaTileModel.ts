// Pure rules for a media tile: which status icon it shows and what its badges say. Kept apart from the
// component so the wording and the status mapping are tested without rendering.
import { recordSummary, type AnalysisRecord } from '@shared/analysis/analysis'
import { analysisErrorText, analysisStatusLabel } from '../analysis/analysisStatus'

// What the top-left corner of a tile shows. Ready and not-yet-analysed footage show nothing.
export type TileStatus =
  { kind: 'none' } | { kind: 'busy'; label: string } | { kind: 'failed'; reason: string }

export function tileStatus(record: AnalysisRecord | undefined): TileStatus {
  if (!record) return { kind: 'none' }
  const summary = recordSummary(record)
  if (summary === 'failed') {
    return { kind: 'failed', reason: analysisErrorText(record) ?? analysisStatusLabel(record) }
  }
  if (summary === 'running' || summary === 'pending') {
    return { kind: 'busy', label: analysisStatusLabel(record) }
  }
  return { kind: 'none' }
}

// Short badge text for how many shorts use a file.
export function shortsBadge(count: number): string {
  return count === 1 ? '1 short' : `${count} shorts`
}

// The moments toggle's text. Its accessible name is what the specs look for, so keep the wording.
export function momentsBadge(count: number): string {
  return count === 1 ? '1 moment' : `${count} moments`
}
