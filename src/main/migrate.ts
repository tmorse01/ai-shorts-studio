import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { z } from 'zod'
import { exportOptionsSchema } from '../shared/schemas'
import type { Job, MediaAsset, Project, Short } from '../shared/types'

const probeSchema = z.object({
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  videoCodec: z.string(),
  hasAudio: z.boolean()
})

const lastExportSchema = z
  .object({ outputDir: z.string(), options: exportOptionsSchema })
  .nullable()
  .default(null)

const mediaSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['source', 'export', 'music']),
  path: z.string(),
  probe: probeSchema,
  proxyPath: z.string().nullable().default(null),
  createdAt: z.string()
})

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  media: z.array(mediaSchema),
  createdAt: z.string(),
  updatedAt: z.string()
})

/** Current on-disk shape. Shorts are validated where they are used, as they always have been. */
const stateSchemaV3 = z.object({
  version: z.literal(3),
  projects: z.array(projectSchema),
  shorts: z.array(z.any()),
  jobs: z.array(z.any()),
  settings: z.object({ lastExport: lastExportSchema })
})

/** Version 2 had one music folder per project. Music is now library entries, so the folder is dropped. */
const stateSchemaV2 = z.object({
  version: z.literal(2),
  projects: z.array(projectSchema.extend({ musicFolder: z.string().nullable() })),
  shorts: z.array(z.any()),
  jobs: z.array(z.any()),
  settings: z.object({ lastExport: lastExportSchema })
})

/** Version 1 kept one video per project and one music folder for the whole app. */
const stateSchemaV1 = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourcePath: z.string().nullable(),
      probe: probeSchema.nullable(),
      proxyPath: z.string().nullable().default(null),
      createdAt: z.string(),
      updatedAt: z.string()
    })
  ),
  shorts: z.array(z.any()),
  jobs: z.array(z.any()),
  settings: z.object({
    musicFolder: z.string().nullable(),
    lastExport: lastExportSchema
  })
})

export interface PersistedState {
  version: 3
  projects: Project[]
  shorts: Short[]
  jobs: Job[]
  settings: { lastExport: { outputDir: string; options: z.infer<typeof exportOptionsSchema> } | null }
}

/**
 * Bring any saved state up to the current shape. Returns `migrated: true` when the file was an older
 * version, so the caller can keep a backup and write the new shape back.
 */
export function migrateState(raw: unknown): { state: PersistedState; migrated: boolean } {
  const version = (raw as { version?: unknown } | null)?.version
  if (version === 1) return { state: migrateV1(stateSchemaV1.parse(raw)), migrated: true }
  if (version === 2) return { state: migrateV2(stateSchemaV2.parse(raw)), migrated: true }
  return { state: stateSchemaV3.parse(raw) as PersistedState, migrated: false }
}

/** v2 → v3: music folders become nothing. Each project keeps its media; music is imported again by the user. */
export function migrateV2(input: z.infer<typeof stateSchemaV2>): PersistedState {
  return {
    version: 3,
    projects: input.projects.map((p) => ({ id: p.id, name: p.name, media: p.media, createdAt: p.createdAt, updatedAt: p.updatedAt })),
    shorts: input.shorts,
    jobs: input.jobs,
    settings: { lastExport: input.settings.lastExport }
  }
}

/**
 * v1 → v3: each project's single video becomes its first media asset, and each short is pointed at its
 * project's source. The old music folder is dropped (see migrateV2).
 */
export function migrateV1(input: z.infer<typeof stateSchemaV1>): PersistedState {
  const projects: Project[] = input.projects.map((p) => {
    const media: MediaAsset[] =
      p.sourcePath && p.probe
        ? [
            {
              id: randomUUID(),
              name: basename(p.sourcePath),
              kind: 'source',
              path: p.sourcePath,
              probe: p.probe,
              proxyPath: p.proxyPath,
              createdAt: p.createdAt
            }
          ]
        : []
    return { id: p.id, name: p.name, media, createdAt: p.createdAt, updatedAt: p.updatedAt }
  })

  const sourceByProject = new Map(projects.map((p) => [p.id, p.media[0]?.id ?? null]))
  const shorts = input.shorts.map((s) => ({ ...s, sourceId: sourceByProject.get(s.projectId) ?? null }))

  return {
    version: 3,
    projects,
    shorts,
    jobs: input.jobs,
    settings: { lastExport: input.settings.lastExport }
  }
}
