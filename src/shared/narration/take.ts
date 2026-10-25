// Pure rules for a voiceover take recorded in the app (Epic 10, #108). A take starts where the playhead
// was when the recording began, so its clip lines up with the picture. Nothing here touches the mic,
// the disk or the store, so the rules are tested directly.
import type { Clip } from '../timeline/timeline'
import { IDENTITY_TRANSFORM } from '../timeline/timeline'

// The largest take the app will accept over IPC. At 16-bit mono 48 kHz this is about 50 minutes.
export const MAX_TAKE_BYTES = 300 * 1024 * 1024

// Count-in choices in ms. Zero means the take starts at once.
export const COUNT_IN_OPTIONS_MS = [0, 2000, 4000] as const
export type CountInMs = (typeof COUNT_IN_OPTIONS_MS)[number]

// Where the take's clip starts on the timeline: the playhead when recording began, whole ms, not
// negative. The count-in is not part of the take, so it never shifts the clip.
export function takeStartMs(playheadMs: number): number {
  return Math.max(0, Math.round(playheadMs))
}

// Length of a take from its sample count. Rounded to whole ms, the timeline's unit.
export function takeDurationMs(sampleCount: number, sampleRate: number): number {
  if (sampleRate <= 0 || sampleCount <= 0) return 0
  return Math.round((sampleCount * 1000) / sampleRate)
}

export interface NarrationTakeClipInput {
  clipId: string
  mediaId: string
  startMs: number
  durationMs: number
}

// The clip a finished take becomes. It plays from the start of its file, and it is marked as recorded.
export function narrationTakeClip({
  clipId,
  mediaId,
  startMs,
  durationMs
}: NarrationTakeClipInput): Clip {
  return {
    id: clipId,
    mediaId,
    startMs: takeStartMs(startMs),
    durationMs: Math.max(1, Math.round(durationMs)),
    sourceInMs: 0,
    transform: { ...IDENTITY_TRANSFORM },
    narration: { source: 'recorded' }
  }
}

// Plain-language message for a failed microphone request. The browser reports these by error name.
export function micErrorMessage(errorName: string | undefined): string {
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow the microphone for AI Shorts Studio in Windows Settings, then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one, then choose it in the list.'
    case 'NotReadableError':
      return 'The microphone is in use by another app. Close that app, then try again.'
    default:
      return 'The microphone could not be started.'
  }
}
