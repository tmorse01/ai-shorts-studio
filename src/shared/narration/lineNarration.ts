// Per-line narration (Epic 10, #114). Each script line can have one narration clip on the Narration lane,
// linked by its scriptLineId. These rules find a line's clip, place a new clip at the line's position, and
// replace only that clip when a line is redone. Pure: no store, disk, mic or network, so they are tested
// directly.
import type { ScriptLine } from '../project/schema'
import { deleteClips, insertClip, addTrack } from '../timeline/edits'
import type { Clip, Timeline, Track } from '../timeline/timeline'
import type { NarrationSource } from '../timeline/narration'

// What a line's narration is made from. 'none' means the line has no clip yet.
export type LineNarrationStatus = 'none' | NarrationSource

export interface LineNarrationState {
  lineId: string
  // Position in the script, from 0.
  index: number
  status: LineNarrationStatus
  // The linked clip, or null when the line has none.
  clipId: string | null
  // Where the line's clip is (or would be placed if the line has none yet), in timeline ms.
  startMs: number
}

// The narration track of a timeline, or undefined when the short has no Narration lane yet.
export function narrationTrackOf(timeline: Timeline): Track | undefined {
  return timeline.tracks.find((track) => track.role === 'narration')
}

// The narration clip linked to each script line. When a line has more than one linked clip, the earliest
// one is used.
export function linkedClipsByLine(timeline: Timeline): Map<string, Clip> {
  const map = new Map<string, Clip>()
  const track = narrationTrackOf(timeline)
  if (!track) return map
  const sorted = [...track.clips].sort((a, b) => a.startMs - b.startMs)
  for (const clip of sorted) {
    const lineId = clip.narration?.scriptLineId
    if (lineId && !map.has(lineId)) map.set(lineId, clip)
  }
  return map
}

// Where a line's clip starts. A line that already has a clip keeps its position, so a redo lands in the same
// place. A new line starts where the latest narrated line before it ends, or at 0 when none is before it.
export function lineStartMs(
  lineIds: readonly string[],
  index: number,
  clips: ReadonlyMap<string, Clip>
): number {
  const existing = clips.get(lineIds[index] ?? '')
  if (existing) return existing.startMs
  let start = 0
  for (let i = 0; i < index; i += 1) {
    const clip = clips.get(lineIds[i] ?? '')
    if (clip) start = Math.max(start, clip.startMs + clip.durationMs)
  }
  return start
}

// The state of every line of a script, in script order.
export function lineNarrationStates(
  lines: readonly ScriptLine[],
  timeline: Timeline
): LineNarrationState[] {
  const clips = linkedClipsByLine(timeline)
  const lineIds = lines.map((line) => line.id)
  return lines.map((line, index) => {
    const clip = clips.get(line.id) ?? null
    return {
      lineId: line.id,
      index,
      status: clip?.narration?.source ?? 'none',
      clipId: clip?.id ?? null,
      startMs: lineStartMs(lineIds, index, clips)
    }
  })
}

// Finds the state of one line. Null when the line is not in the script.
export function lineNarrationStateFor(
  lines: readonly ScriptLine[],
  timeline: Timeline,
  lineId: string
): LineNarrationState | null {
  return lineNarrationStates(lines, timeline).find((state) => state.lineId === lineId) ?? null
}

export interface SetLineClipInput {
  // The script's line ids in order. Used for the line's position.
  lineIds: readonly string[]
  lineId: string
  // The clip to place. Its startMs is set from the line's position.
  clip: Clip
  // Id for a Narration lane the short does not have yet.
  narrationTrackId: string
}

// Puts a line's narration clip on the Narration lane. Any clip already linked to this line is removed first,
// so a redo replaces only that clip. Other lines' clips and the rest of the timeline are not touched.
export function setLineNarrationClip(timeline: Timeline, input: SetLineClipInput): Timeline {
  const index = input.lineIds.indexOf(input.lineId)
  if (index < 0) throw new Error(`The script has no line ${input.lineId}.`)
  if (!input.clip.narration || input.clip.narration.scriptLineId !== input.lineId) {
    throw new Error('The clip must be linked to the line it narrates.')
  }
  const clips = linkedClipsByLine(timeline)
  const startMs = lineStartMs(input.lineIds, index, clips)
  const previous = clips.get(input.lineId)

  let next = timeline
  if (!narrationTrackOf(next)) {
    next = addTrack(next, {
      id: input.narrationTrackId,
      kind: 'audio',
      role: 'narration',
      muted: false,
      clips: []
    })
  }
  if (previous) next = deleteClips(next, [previous.id])

  const track = narrationTrackOf(next)
  if (!track) throw new Error('The short has no Narration lane.')
  return insertClip(next, track.id, input.clip, startMs)
}

// Plain-language summary for a line's state, for the list row.
export function lineNarrationLabel(status: LineNarrationStatus): string {
  switch (status) {
    case 'recorded':
      return 'Recorded'
    case 'tts':
      return 'Generated'
    case 'imported':
      return 'Imported'
    case 'none':
      return 'Not narrated'
  }
}
