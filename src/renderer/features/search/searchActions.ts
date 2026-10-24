// What opening a search result does: the source viewer opens the clip at the match, with the matching
// range marked. A file-level tag match has no range of its own, so it opens the clip alone.
import type { SearchHit } from '@shared/search/searchIndex'
import { sourceStore } from '../source/sourceStore'

export function openSearchHit(hit: SearchHit): void {
  const hasRange = hit.kind !== 'tag' && hit.endMs > hit.startMs
  if (hasRange) sourceStore.getState().openRange(hit.mediaId, hit.startMs, hit.endMs)
  else sourceStore.getState().openSource(hit.mediaId)
}

/** The kind of match, in words a user reads on a result row. */
export const SEARCH_KIND_LABEL: Record<SearchHit['kind'], string> = {
  segment: 'Speech',
  shot: 'Shot',
  tag: 'Tag',
  moment: 'Moment'
}
