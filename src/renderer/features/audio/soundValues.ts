// The sound settings the inspector's sound fields show and edit (Epic 08, #97 and #99). Defaults match
// the timeline's defaults for a clip that has never been set.
import type { Clip } from '@shared/timeline/timeline'

export interface SoundValues {
  muted: boolean
  gain: number
  fadeInMs: number
  fadeOutMs: number
}

export function soundValuesOf(clip: Clip): SoundValues {
  return {
    muted: clip.muted ?? false,
    gain: clip.gain ?? 1,
    fadeInMs: clip.fadeInMs ?? 0,
    fadeOutMs: clip.fadeOutMs ?? 0
  }
}
