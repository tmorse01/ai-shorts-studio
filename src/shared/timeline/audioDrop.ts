// Turns a footage drop on the Music or Narration lane into an audio clip. Pure, so the rules are tested
// without the DOM. Only audio footage goes on these lanes. The clip plays like any audio clip, so no new
// clip kind is needed. A narration clip also records its source (Epic 10, #107).
import type { MediaRef } from '../project/schema'
import type { DragPayload } from './dragPayload'
import { IDENTITY_TRANSFORM, type Clip } from './timeline'

export type AudioDropResult = { ok: true; clip: Clip } | { ok: false; reason: string }

export type AudioLane = 'music' | 'narration'

const LANE_NAMES: Record<AudioLane, string> = { music: 'Music', narration: 'Narration' }

export function audioClipForDrop(
  payload: DragPayload,
  media: readonly MediaRef[],
  clipId: string,
  startMs: number,
  lane: AudioLane = 'music'
): AudioDropResult {
  const laneName = LANE_NAMES[lane]
  if (payload.kind === 'moment') {
    return { ok: false, reason: `Moments cannot be dropped on the ${laneName} lane yet.` }
  }
  const ref = media.find((item) => item.id === payload.mediaId)
  if (!ref) return { ok: false, reason: 'That file is no longer in the project.' }
  if (ref.kind !== 'audio') {
    return { ok: false, reason: `Only audio files can go on the ${laneName} lane.` }
  }
  const clip: Clip = {
    id: clipId,
    mediaId: ref.id,
    startMs: Math.max(0, Math.round(startMs)),
    durationMs: payload.outMs - payload.inMs,
    sourceInMs: payload.inMs,
    transform: { ...IDENTITY_TRANSFORM }
  }
  if (lane === 'narration') clip.narration = { source: 'imported' }
  return { ok: true, clip }
}
