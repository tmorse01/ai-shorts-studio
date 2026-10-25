// What the suggestion panel shows for one clip. A tag already on the clip and a moment already saved from
// the same range are accepted, so they leave the list. Undoing an accept brings them back. Pure.
import type { MomentSuggestion, SuggestionsOutput } from '@shared/analysis/suggestions'
import type { Project } from '@shared/project/schema'
import { findTagByName } from '../media/mediaTags'

export interface OpenSuggestions {
  tags: string[]
  moments: MomentSuggestion[]
}

export function openSuggestions(
  project: Pick<Project, 'media' | 'mediaTags' | 'moments'>,
  mediaId: string,
  output: SuggestionsOutput
): OpenSuggestions {
  const ref = project.media.find((item) => item.id === mediaId)
  const onClip = new Set(ref?.tagIds ?? [])
  const tags = output.tags.filter((name) => {
    const tag = findTagByName(project, name)
    return !tag || !onClip.has(tag.id)
  })
  const moments = output.moments.filter(
    (moment) =>
      !project.moments.some(
        (saved) =>
          saved.mediaId === mediaId && saved.inMs === moment.inMs && saved.outMs === moment.outMs
      )
  )
  return { tags, moments }
}
