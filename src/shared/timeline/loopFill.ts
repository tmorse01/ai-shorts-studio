// Loop to fill (Epic 12, #123): repeats a music clip until a length, with a crossfade at each loop
// point. Pure, so the layout is tested without the DOM. The copies share the clip's footage and
// source in-point, and each loop point is a transition whose length is the overlap.
import type { Clip, Transition } from './timeline'

// The longest overlap at each loop point. A clip shorter than twice this crossfades for half its length.
export const LOOP_CROSSFADE_MS = 500

export interface LoopLayout {
  copies: Clip[]
  transitions: Transition[]
}

// Lays out the copies that follow clip until untilMs. Each copy starts before the previous one ends
// by the crossfade, and the last copy is cut to end at untilMs. The original clip is not in the
// result. Returns no copies when clip already reaches untilMs.
export function loopLayout(clip: Clip, untilMs: number, newId: () => string): LoopLayout {
  const copies: Clip[] = []
  const transitions: Transition[] = []
  const overlap = Math.min(LOOP_CROSSFADE_MS, Math.floor(clip.durationMs / 2))
  let previous: Clip = clip
  while (previous.startMs + previous.durationMs < untilMs) {
    const previousEnd = previous.startMs + previous.durationMs
    const startMs = previousEnd - overlap
    const copy: Clip = {
      ...clip,
      id: newId(),
      startMs,
      durationMs: Math.min(clip.durationMs, untilMs - startMs)
    }
    delete copy.linkedAudio
    delete copy.momentId
    if (overlap > 0) {
      transitions.push({
        id: newId(),
        fromClipId: previous.id,
        toClipId: copy.id,
        durationMs: overlap
      })
    }
    copies.push(copy)
    previous = copy
  }
  return { copies, transitions }
}
