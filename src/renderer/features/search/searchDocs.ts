// Turns one media item's transcript, shot descriptions, tags and moments into search documents. Pure, so
// the mapping is tested without the index, the disk or IPC.
import type { AnalysisRecord, ShotRange } from '@shared/analysis/analysis'
import type { Transcript } from '@shared/analysis/transcript'
import type { SearchDoc } from '@shared/search/searchIndex'
import type { MediaRef, Moment } from '@shared/project/schema'

export interface VisionText {
  shotIndex: number
  description: string
  tags: string[]
}

export interface MediaSearchInput {
  ref: MediaRef
  transcript: Transcript | null
  shots: readonly ShotRange[]
  vision: readonly VisionText[]
  /** Tag names by tag id, for the file's tags and the moments' tags. */
  tagNames: ReadonlyMap<string, string>
  moments: readonly Moment[]
}

const toMs = (seconds: number): number => Math.max(0, Math.round(seconds * 1000))

/** Every searchable piece of one media item, with its source range. */
export function buildMediaSearchDocs(input: MediaSearchInput): SearchDoc[] {
  const { ref } = input
  const docs: SearchDoc[] = []
  const add = (kind: SearchDoc['kind'], text: string, startMs: number, endMs: number) => {
    const clean = text.trim()
    if (clean === '') return
    docs.push({
      id: `${ref.id}:${kind}:${docs.length}`,
      mediaId: ref.id,
      kind,
      text: clean,
      startMs,
      endMs
    })
  }
  const nameOf = (id: string) => input.tagNames.get(id) ?? ''

  for (const segment of input.transcript?.segments ?? []) {
    add('segment', segment.text, segment.startMs, segment.endMs)
  }

  for (const shot of input.vision) {
    const range = input.shots[shot.shotIndex]
    if (!range) continue
    add(
      'shot',
      `${shot.description} ${shot.tags.join(' ')}`,
      toMs(range.startSec),
      toMs(range.endSec)
    )
  }

  const fileTags = (ref.tagIds ?? []).map(nameOf).filter((name) => name !== '')
  if (fileTags.length > 0) add('tag', fileTags.join(' '), 0, ref.durationMs ?? 0)

  for (const moment of input.moments) {
    if (moment.mediaId !== ref.id) continue
    const tags = moment.tags.map(nameOf).filter((name) => name !== '')
    add('moment', [moment.name, ...tags].join(' '), moment.inMs, moment.outMs)
  }

  return docs
}

/** What the index was built from, for one record. A change to it means the item needs indexing again. */
export function analysisSignature(record: AnalysisRecord | undefined): string {
  if (!record) return ''
  const stages = (['transcript', 'shots', 'vision'] as const)
    .map((stage) => record.stages[stage].status)
    .join(',')
  return `${record.version}|${stages}|${record.shots?.length ?? 0}`
}
