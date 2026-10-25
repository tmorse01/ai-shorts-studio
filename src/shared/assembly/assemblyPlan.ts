// The assembly plan (Epic 15, #137): a reviewable list of cuts for each script line, built from the
// script before anything reaches the timeline. applyAssemblyPlan turns a plan into timeline edits and
// keeps clips the user locked. Pure logic, shared by main and the renderer.
import { z } from 'zod'
import { assemblyAlternativeSchema } from '../timeline/clipAssembly'
import { IDENTITY_TRANSFORM, type Clip, type Timeline, type Track } from '../timeline/timeline'
import { settle, TimelineEditError } from '../timeline/edits'

const nonEmptyString = z.string().trim().min(1)

export const assemblyRoleSchema = z.enum(['a', 'b'])
export type AssemblyRole = z.infer<typeof assemblyRoleSchema>

// One cut from a source. Times are source milliseconds. `alternatives` lists other takes for the
// same slot.
export const assemblyCutSchema = z
  .object({
    sourceId: nonEmptyString,
    inMs: z.number().int().nonnegative(),
    outMs: z.number().int().nonnegative(),
    role: assemblyRoleSchema,
    alternatives: z.array(assemblyAlternativeSchema)
  })
  .refine((cut) => cut.outMs > cut.inMs, { message: 'outMs must be greater than inMs' })
export type AssemblyCut = z.infer<typeof assemblyCutSchema>

export const assemblyLineSchema = z.object({
  lineId: nonEmptyString,
  cuts: z.array(assemblyCutSchema)
})
export type AssemblyLine = z.infer<typeof assemblyLineSchema>

export const assemblyPlanSchema = z.object({
  lines: z.array(assemblyLineSchema)
})
export type AssemblyPlan = z.infer<typeof assemblyPlanSchema>

export type ApplyAssemblyOptions = {
  // The track the cuts are appended to.
  trackId: string
  // Called once per new clip, in plan order.
  newId: () => string
}

// The ids of the clips that a plan for these lines replaces on a track: the track's unlocked clips
// placed for one of the lines, plus their linked audio. Locked clips and clips from other lines are
// not in the set. Shared by applyAssemblyPlan and the single-line re-assembly (#142).
export function clipIdsReplacedBy(track: Track, lineIds: ReadonlySet<string>): Set<string> {
  const replaced = track.clips.filter(
    (clip) =>
      clip.assembly !== undefined && lineIds.has(clip.assembly.lineId) && clip.locked !== true
  )
  const dropIds = new Set<string>(replaced.map((clip) => clip.id))
  for (const clip of replaced) {
    if (clip.linkedAudio) dropIds.add(clip.linkedAudio)
  }
  return dropIds
}

// Applies a plan to one track.Clips from the plan's lines that are not locked are replaced; their
// linked audio goes with them. Locked clips, and clips from lines the plan does not mention, stay
// where they are. The new cuts follow the last kept clip on the track, in plan order. Returns a new
// timeline; the input is not mutated.
export function applyAssemblyPlan(
  timeline: Timeline,
  plan: AssemblyPlan,
  options: ApplyAssemblyOptions
): Timeline {
  const lineIds = new Set<string>()
  for (const line of plan.lines) {
    if (lineIds.has(line.lineId)) {
      throw new TimelineEditError(`The plan lists line "${line.lineId}" more than once.`)
    }
    lineIds.add(line.lineId)
  }

  const target = timeline.tracks.find((track) => track.id === options.trackId)
  if (!target) throw new TimelineEditError(`No track with id "${options.trackId}".`)
  if (target.locked) throw new TimelineEditError(`Track "${target.id}" is locked.`)

  const dropIds = clipIdsReplacedBy(target, lineIds)

  const tracks: Track[] = timeline.tracks.map((track) => {
    if (!track.clips.some((clip) => dropIds.has(clip.id))) return track
    if (track.locked) throw new TimelineEditError(`Track "${track.id}" is locked.`)
    return { ...track, clips: track.clips.filter((clip) => !dropIds.has(clip.id)) }
  })
  const kept = tracks.find((track) => track.id === target.id)?.clips ?? []
  let cursor = Math.max(0, ...kept.map((clip) => clip.startMs + clip.durationMs))

  const placed: Clip[] = []
  for (const line of plan.lines) {
    for (const cut of line.cuts) {
      placed.push({
        id: options.newId(),
        mediaId: cut.sourceId,
        startMs: cursor,
        durationMs: cut.outMs - cut.inMs,
        sourceInMs: cut.inMs,
        transform: { ...IDENTITY_TRANSFORM },
        assembly: {
          lineId: line.lineId,
          alternatives: cut.alternatives.map((alternative) => ({ ...alternative }))
        }
      })
      cursor += cut.outMs - cut.inMs
    }
  }

  return settle({
    ...timeline,
    tracks: tracks.map((track) =>
      track.id === target.id ? { ...track, clips: [...kept, ...placed] } : track
    )
  })
}
