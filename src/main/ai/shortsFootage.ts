// Reads what one source's shorts are based on: the cached transcript, the shot ranges with their vision
// descriptions, and the AI moment suggestions the user has not dismissed. Only text is read, never video.
import { momentSuggestionKey, notDismissed } from '@shared/analysis/suggestions'
import type { ShortsSourceFootage } from '@shared/shorts/shortPlan'
import { readSuggestionFootage } from '../analysis/suggestionsService'
import { loadSuggestionsFile, suggestionsPath } from '../analysis/suggestionsFile'
import type { ShortsFootageSource } from './shortGenerator'

export const readShortsFootage: ShortsFootageSource = async (projectFolder, mediaId) => {
  const footage = await readSuggestionFootage(projectFolder, mediaId)
  const file = await loadSuggestionsFile(suggestionsPath(projectFolder, mediaId))
  const result: ShortsSourceFootage = {
    segments: footage.segments,
    shots: footage.shots,
    suggestions: notDismissed(file.moments, file.dismissed, momentSuggestionKey)
  }
  return result
}
