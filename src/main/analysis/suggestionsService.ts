// Suggestions for one clip. Tags are derived from the analysis on every read, so they follow the latest
// transcript and vision results. Moments come from one Claude request per clip, started by the user. Every
// result is filtered by the dismissed keys before it is saved or returned, so a dismissed suggestion never
// comes back, not even after a re-analysis. Nothing here changes the project: the renderer applies accepted
// suggestions through a project command.
import {
  alignMoments,
  buildMomentPrompt,
  deriveTagSuggestions,
  MOMENT_MAX_TOKENS,
  momentSuggestionKey,
  notDismissed,
  parseMomentReply,
  tagSuggestionKey,
  type SuggestionsFile,
  type SuggestionsOutput
} from '@shared/analysis/suggestions'
import { loadAnalysisFile, visionResultPath } from './analysisFile'
import { readMediaTranscript } from './transcriptRead'
import { loadVisionResult } from '../ai/visionResultFile'
import { UserFacingError } from '../errors'
import type { AiService } from '../ai/aiService'
import { loadSuggestionsFile, saveSuggestionsFile, suggestionsPath } from './suggestionsFile'

export interface SuggestionFootage {
  /** True with speech, false without, undefined before the transcript stage has run. */
  speech: boolean | undefined
  segments: { startMs: number; endMs: number; text: string }[]
  shots: { shotIndex: number; startSec: number; endSec: number; description?: string }[]
  shotTags: string[][]
}

/** Reads what a clip's suggestions are based on. Tests pass a fake, so no disk is read. */
export type SuggestionFootageSource = (
  projectFolder: string,
  mediaId: string
) => Promise<SuggestionFootage>

/** Reads the cached transcript, the shot ranges and the vision descriptions. Only text is read, never video. */
export async function readSuggestionFootage(
  projectFolder: string,
  mediaId: string
): Promise<SuggestionFootage> {
  const { transcript } = await readMediaTranscript(projectFolder, mediaId)
  const segments = (transcript?.segments ?? []).map((segment) => ({
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text
  }))
  const speech = transcript ? segments.some((segment) => segment.text.trim() !== '') : undefined

  // A vision shot's index is its position in the shots stage's ranges.
  const analysis = await loadAnalysisFile(projectFolder)
  const ranges = analysis.records[mediaId]?.shots ?? []
  const vision = await loadVisionResult(visionResultPath(projectFolder, mediaId))
  const described = new Map((vision?.shots ?? []).map((shot) => [shot.shotIndex, shot]))
  const shots = ranges.map((range, shotIndex) => ({
    shotIndex,
    startSec: range.startSec,
    endSec: range.endSec,
    description: described.get(shotIndex)?.description
  }))
  const shotTags = [...described.values()].map((shot) => shot.tags)

  return { speech, segments, shots, shotTags }
}

// The suggestions the user still has to act on: derived tags and saved moments, minus dismissed keys.
function visibleOf(footage: SuggestionFootage, file: SuggestionsFile): SuggestionsOutput {
  const tags = notDismissed(
    deriveTagSuggestions({ speech: footage.speech, shotTags: footage.shotTags }),
    file.dismissed,
    tagSuggestionKey
  )
  const moments = notDismissed(file.moments, file.dismissed, momentSuggestionKey)
  return { tags, moments }
}

/** The clip's current suggestions. Nothing is generated here. */
export async function readSuggestions(
  projectFolder: string,
  mediaId: string,
  footageSource: SuggestionFootageSource = readSuggestionFootage
): Promise<SuggestionsOutput> {
  const footage = await footageSource(projectFolder, mediaId)
  const file = await loadSuggestionsFile(suggestionsPath(projectFolder, mediaId))
  return visibleOf(footage, file)
}

/**
 * Asks Claude for candidate moments of one clip and saves them, replacing the previous list. Dismissed
 * moments are left out. Throws a plain message when no key is saved, the cap is reached, the clip has no
 * analysis to work from, or the reply cannot be read.
 */
export async function findMomentSuggestions(
  ai: AiService,
  input: { projectFolder: string; mediaId: string; fileName: string; durationMs?: number },
  footageSource: SuggestionFootageSource = readSuggestionFootage
): Promise<SuggestionsOutput> {
  await ai.ready()
  const availability = ai.visionAvailability()
  if (availability === 'no-key') {
    throw new UserFacingError('Add an Anthropic API key in Settings first.')
  }
  if (availability === 'capped') {
    throw new UserFacingError(
      "This month's AI spend cap is reached. Raise the cap in Settings to continue."
    )
  }

  const footage = await footageSource(input.projectFolder, input.mediaId)
  if (footage.segments.length === 0 && footage.shots.length === 0) {
    throw new UserFacingError('Analyze this clip first, so there is a transcript or shots to read.')
  }

  const model = ai.visionModel()
  const client = await ai.client()
  const reply = await client.sendMessage({
    model,
    maxTokens: MOMENT_MAX_TOKENS,
    prompt: buildMomentPrompt({
      fileName: input.fileName,
      segments: footage.segments,
      shots: footage.shots
    })
  })
  await ai.recordUsage(model, reply.usage)

  const candidates = parseMomentReply(reply.text)
  if (!candidates) {
    throw new UserFacingError('Claude sent a reply the app could not read. Try again.')
  }
  const moments = alignMoments({
    candidates,
    shots: footage.shots,
    segments: footage.segments,
    durationMs: input.durationMs
  })

  const path = suggestionsPath(input.projectFolder, input.mediaId)
  const previous = await loadSuggestionsFile(path)
  const next: SuggestionsFile = {
    moments: notDismissed(moments, previous.dismissed, momentSuggestionKey),
    dismissed: previous.dismissed
  }
  await saveSuggestionsFile(path, next)
  return visibleOf(footage, next)
}

/**
 * Records the user's dismissals. Each key is a tag or moment suggestion key. The dismissed moments are
 * removed from the saved list, so they stay gone until the user deletes the file.
 */
export async function dismissSuggestions(
  projectFolder: string,
  mediaId: string,
  keys: readonly string[],
  footageSource: SuggestionFootageSource = readSuggestionFootage
): Promise<SuggestionsOutput> {
  const path = suggestionsPath(projectFolder, mediaId)
  const previous = await loadSuggestionsFile(path)
  const dismissed = [...new Set([...previous.dismissed, ...keys])]
  const next: SuggestionsFile = {
    moments: notDismissed(previous.moments, dismissed, momentSuggestionKey),
    dismissed
  }
  await saveSuggestionsFile(path, next)
  const footage = await footageSource(projectFolder, mediaId)
  return visibleOf(footage, next)
}
