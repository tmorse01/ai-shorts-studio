// Ordered upgrades for project.json. Each migration takes the raw parsed JSON of one schema version
// and returns the next version's shape. The runner in ./loadProject.ts applies them in order.
// A migration may throw; the runner reports that as a readable error and changes nothing on disk.

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

// The ordered list the app ships with. Append new migrations here; never edit an old one.
export const projectMigrations: readonly ProjectMigration[] = [
  { from: 1, to: 2, up: migrateV1ToV2 }
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
