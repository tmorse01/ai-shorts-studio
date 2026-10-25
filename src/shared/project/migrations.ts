// Ordered upgrades for project.json. Each migration takes the raw parsed JSON of one schema version
// and returns the next version's shape. The runner in ./loadProject.ts applies them in order.
// A migration may throw; the runner reports that as a readable error and changes nothing on disk.
import { DEFAULT_SHORT_DEFAULTS } from './schema'
import { timelineSchema, type Timeline, type TrackRole } from '../timeline/timeline'

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

// v4 tracks had no role. Each gets one from its kind. The first video track is the main sequence;
// any further video track is an overlay, so the main track never has two sequences. Timelines get
// no transitions key until one is added.
export function migrateV4ToV5(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const shorts = data.shorts
  if (shorts === undefined) return { ...data, schemaVersion: 5 }
  if (!Array.isArray(shorts)) throw new Error('"shorts" is not a list')

  const upgradedShorts = shorts.map((item, index) => {
    if (!isRecord(item)) throw new Error(`short ${index + 1} is not an object`)
    return { ...item, timeline: withTrackRoles(item.timeline) }
  })
  return { ...data, schemaVersion: 5, shorts: upgradedShorts }
}

// v5 had no media tags. The project gets an empty custom tag list. Media keeps no tag ids until one is set.
export function migrateV5ToV6(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 6, mediaTags: [] }
}

// v6 had no moments. The project gets an empty moment list.
export function migrateV6ToV7(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 7, moments: [] }
}

// v7 had no clip framing. Clips keep no framing key until one is set, so only the version changes.
export function migrateV7ToV8(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 8 }
}

// v8 stored scripts as placeholders: a `name` and untyped `lines`. Each script becomes a titled
// script with an empty topic. A line keeps its text when it is a string or an object with text, and
// gets a generated id. Any other line shape is dropped, since no version ever wrote one.
export function migrateV8ToV9(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const scripts = data.scripts
  if (scripts === undefined) return { ...data, schemaVersion: 9 }
  if (!Array.isArray(scripts)) throw new Error('"scripts" is not a list')

  const upgradedScripts = scripts.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      throw new Error(`script ${index + 1} has no "id"`)
    }
    const scriptId: string = item.id
    const title = typeof item.name === 'string' && item.name.trim() !== '' ? item.name : 'Untitled'
    const rawLines = Array.isArray(item.lines) ? item.lines : []
    const lines = rawLines.flatMap((line, lineIndex) => scriptLineOrNone(scriptId, line, lineIndex))
    return { id: scriptId, title, topic: '', lines }
  })
  return { ...data, schemaVersion: 9, scripts: upgradedScripts }
}

// v9 had no auto-ducking. A short keeps no ducking key until one is set, so only the version changes.
export function migrateV9ToV10(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 10 }
}

// v10 had no clip fades. Clips keep no fade keys until one is set, so only the version changes.
export function migrateV10ToV11(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 11 }
}

// v11 tracks had no caption blocks. Tracks keep no captions key until one is added, so only the
// version changes.
export function migrateV11ToV12(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 12 }
}

// v12 kept a text clip's words in a plain `text` key, which only labels the clip. v13 gives each text
// clip with words a textItem in the caption style, centred low in the frame, so it draws as an overlay.
// The `text` key stays as the clip label. Clips on other tracks are left alone.
export function migrateV12ToV13(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  const shorts = data.shorts
  if (shorts === undefined) return { ...data, schemaVersion: 13 }
  if (!Array.isArray(shorts)) throw new Error('"shorts" is not a list')
  const upgradedShorts = shorts.map((item) => {
    if (!isRecord(item) || !isRecord(item.timeline) || !Array.isArray(item.timeline.tracks)) {
      return item
    }
    const tracks = item.timeline.tracks.map((track: unknown) => {
      if (!isRecord(track) || track.kind !== 'text' || !Array.isArray(track.clips)) return track
      return { ...track, clips: track.clips.map(upgradeTextClip) }
    })
    return { ...item, timeline: { ...item.timeline, tracks } }
  })
  return { ...data, schemaVersion: 13, shorts: upgradedShorts }
}

function upgradeTextClip(clip: unknown): unknown {
  if (!isRecord(clip) || typeof clip.text !== 'string' || clip.text.trim() === '') return clip
  return { ...clip, textItem: { text: clip.text, styleId: 'caption', x: 0.5, y: 0.85, scale: 1 } }
}

// v13 clips had no lock and no assembly metadata. Clips keep no such keys until one is set, so only the
// version changes.
export function migrateV13ToV14(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 14 }
}

// v14 had no caption presets and no per-short caption preset. Both keys are optional and read as their
// defaults when unset, so only the version changes.
export function migrateV14ToV15(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 15 }
}

// v15 had no change that needs a key. Only the version changes.
export function migrateV15ToV16(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 16 }
}

// v16 had no change that needs a key. Only the version changes. Schema 17 adds the optional imageItem key.
export function migrateV16ToV17(data: unknown): unknown {
  if (!isRecord(data)) throw new Error('the file is not a JSON object')
  return { ...data, schemaVersion: 17 }
}

function scriptLineOrNone(scriptId: string, value: unknown, index: number): unknown[] {
  const generatedId = `${scriptId}_line_${index + 1}`
  if (typeof value === 'string') return [{ id: generatedId, text: value }]
  if (isRecord(value) && typeof value.text === 'string') {
    const id = typeof value.id === 'string' && value.id.trim() !== '' ? value.id : generatedId
    return [{ id, text: value.text }]
  }
  return []
}

// The ordered list the app ships with. Append new migrations here; never edit an old one.
export const projectMigrations: readonly ProjectMigration[] = [
  { from: 1, to: 2, up: migrateV1ToV2 },
  { from: 2, to: 3, up: migrateV2ToV3 },
  { from: 3, to: 4, up: migrateV3ToV4 },
  { from: 4, to: 5, up: migrateV4ToV5 },
  { from: 5, to: 6, up: migrateV5ToV6 },
  { from: 6, to: 7, up: migrateV6ToV7 },
  { from: 7, to: 8, up: migrateV7ToV8 },
  { from: 8, to: 9, up: migrateV8ToV9 },
  { from: 9, to: 10, up: migrateV9ToV10 },
  { from: 10, to: 11, up: migrateV10ToV11 },
  { from: 11, to: 12, up: migrateV11ToV12 },
  { from: 12, to: 13, up: migrateV12ToV13 },
  { from: 13, to: 14, up: migrateV13ToV14 },
  { from: 14, to: 15, up: migrateV14ToV15 },
  { from: 15, to: 16, up: migrateV15ToV16 },
  { from: 16, to: 17, up: migrateV16ToV17 }
]

function withTrackRoles(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.tracks)) return value
  let hasMain = false
  const tracks = value.tracks.map((track) => {
    if (!isRecord(track) || track.role !== undefined) return track
    let role: TrackRole
    if (track.kind === 'video' && !hasMain) {
      role = 'main'
      hasMain = true
    } else if (track.kind === 'audio') {
      role = 'music'
    } else if (track.kind === 'text') {
      role = 'text'
    } else {
      role = 'overlay'
    }
    return { ...track, role }
  })
  return { ...value, tracks }
}

function timelineOrEmpty(value: unknown): Timeline {
  const parsed = timelineSchema.safeParse(value)
  return parsed.success ? parsed.data : { tracks: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
