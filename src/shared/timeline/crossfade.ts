// Overlap crossfades (Epic 12, #123): loop-to-fill copies overlap the clip they follow by the
// transition's length. The incoming clip starts at the transition's start, and inside that window the
// outgoing clip fades out while the incoming one fades in, on equal-power curves. Cut transitions
// (clips meeting end to start) are not handled here: ./transitions.ts gives them their fade. Pure, so
// the preview mix and export apply the same gains.
import type { Clip, Timeline } from './timeline'
import { isCut } from './transitions'

// The gain of each clip that sits inside a crossfade at tMs. A clip not in a window is absent, which
// means 1. The outgoing clip gets the falling curve and the incoming clip the rising one.
export function crossfadeGains(timeline: Timeline, tMs: number): Map<string, number> {
  const gains = new Map<string, number>()
  const transitions = timeline.transitions ?? []
  if (transitions.length === 0) return gains

  const clips = new Map<string, Clip>()
  for (const track of timeline.tracks) {
    for (const clip of track.clips) clips.set(clip.id, clip)
  }

  for (const transition of transitions) {
    const from = clips.get(transition.fromClipId)
    const to = clips.get(transition.toClipId)
    if (!from || !to || isCut(from, to)) continue
    const startMs = to.startMs
    if (tMs < startMs || tMs >= startMs + transition.durationMs) continue
    const progress = (tMs - startMs) / transition.durationMs
    // Multiplied, so a clip that is both an incoming and an outgoing side keeps both fades.
    gains.set(to.id, (gains.get(to.id) ?? 1) * Math.sin((progress * Math.PI) / 2))
    gains.set(from.id, (gains.get(from.id) ?? 1) * Math.cos((progress * Math.PI) / 2))
  }
  return gains
}
