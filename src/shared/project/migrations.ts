// Ordered upgrades for project.json. Each migration takes the raw parsed JSON of one schema version
// and returns the next version's shape. The runner in ./loadProject.ts applies them in order.
// A migration may throw; the runner reports that as a readable error and changes nothing on disk.
import { DEFAULT_SHORT_DEFAULTS } from './schema'
import { timelineSchema, type Timeline } from '../timeline/timeline'

export type ProjectMigration = {
  from: number
  to: number
  up: (data: unknown) => unknown
}

// A path is absolute when it has a Windows drive, a UNC prefix, or starts with a slash. This is
// done by hand because this module is shared with the renderer and cannot use node:path.
const ABSOLUTE_PATH = /^([a-zA-Z]:[\\/]|\\\\|\/)/

// v1 stored every media path as given, with no pathKind. v2 records whether it is relative.
export function migrateV1ToV2(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const media = data.media
  if (media === undefined) return { ...data, schemaVersion: 2 }
  if (!Array.isArray(media)) throw new Error('"media" is not a list')

  const upgradedMedia = media.map((item, index) => {
    if (!isRecord(item) || typeof item.path !== 'string') {
      throw new Error(`media item ${index + 1} has no "path"`)
    }
    return { ...item, pathKind: ABSOLUTE_PATH.test(item.path) ? 'absolute' : 'relative' }
  })
  return { ...data, schemaVersion: 2, media: upgradedMedia }
}

// v2 had no project defaults and no per-short settings. Every short gets the default settings, its
// position in the list, and no overrides. Shorts keep their file order.
export function migrateV2ToV3(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const defaults = DEFAULT_SHORT_DEFAULTS
  const shorts = data.shorts
  if (shorts === undefined) return { ...data, schemaVersion: 3, defaults }
  if (!Array.isArray(shorts)) throw new Error('"shorts" is not a list')

  const upgradedShorts = shorts.map((item, index) => {
    if (!isRecord(item)) throw new Error(`short ${index + 1} is not an object`)
    return {
      ...item,
      order: index,
      targetLength: { ...defaults.targetLength },
      platform: defaults.platform,
      overrides: {},
      editedSinceExport: false
    }
  })
  return { ...data, schemaVersion: 3, defaults, shorts: upgradedShorts }
}

// v3 stored each short's timeline as a placeholder object. A timeline that already matches the
// schema is kept. Anything else is replaced by an empty timeline, so the short opens with no clips.
export function migrateV3ToV4(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const shorts = data.shorts
  if (shorts === undefined) return { ...data, schemaVersion: 4 }
  if (!Array.isArray(shorts)) throw new Error('"shorts" is not a list')

  const upgradedShorts = shorts.map((item, index) => {
    if (!isRecord(item)) throw new Error(`short ${index + 1} is not an object`)
    return { ...item, timeline: timelineOrEmpty(item.timeline) }
  })
  return { ...data, schemaVersion: 4, shorts: upgradedShorts }
}

// The ordered list the app ships with. Append new migrations here; never edit an old one.
export const projectMigrations: readonly ProjectMigration[] = [
  { from: 1, to: 2, up: migrateV1ToV2 },
  { from: 2, to: 3, up: migrateV2ToV3 },
  { from: 3, to: 4, up: migrateV3ToV4 }
]

function timelineOrEmpty(value: unknown): Timeline {
  const parsed = timelineSchema.safeParse(value)
  return parsed.success ? parsed.data : { tracks: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
