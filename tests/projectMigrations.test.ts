import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@shared/project/schema'
import { migrateV1ToV2, projectMigrations, type ProjectMigration } from '@shared/project/migrations'
import { loadProject, migrateToVersion } from '@shared/project/loadProject'

// A project as the first cut wrote it: media paths had no pathKind.
function sampleV1Project() {
  return {
    schemaVersion: 1,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:30:00.000Z',
    media: [
      {
        id: 'media_1',
        path: 'footage/interview.mp4',
        fileName: 'interview.mp4',
        sizeBytes: 1_048_576,
        kind: 'video'
      },
      {
        id: 'media_2',
        path: 'D:\\Shoots\\broll.mov',
        fileName: 'broll.mov',
        sizeBytes: 2048,
        kind: 'video'
      }
    ],
    shorts: [],
    scripts: []
  }
}

describe('sample migration v1 -> v2', () => {
  it('adds pathKind to each media item and bumps schemaVersion', () => {
    const result = loadProject(sampleV1Project())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.migrated).toBe(true)
    expect(result.value.fromVersion).toBe(1)
    expect(result.value.toVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.value.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.value.project.media.map((media) => media.pathKind)).toEqual([
      'relative',
      'absolute'
    ])
  })

  it('does not change the object it was given', () => {
    const original = sampleV1Project()
    const snapshot = JSON.parse(JSON.stringify(original))
    loadProject(original)
    expect(original).toEqual(snapshot)
  })

  it.each([
    ['footage/a.mp4', 'relative'],
    ['clips\\a.mp4', 'relative'],
    ['C:\\Video\\a.mp4', 'absolute'],
    ['d:/video/a.mp4', 'absolute'],
    ['\\\\server\\share\\a.mp4', 'absolute'],
    ['/Users/editor/a.mp4', 'absolute']
  ])('classifies %s as %s', (path, expected) => {
    const migrated = migrateV1ToV2({
      schemaVersion: 1,
      media: [{ id: 'm', path, fileName: 'a.mp4', sizeBytes: 1, kind: 'video' }]
    }) as { media: Array<{ pathKind: string }> }
    expect(migrated.media[0].pathKind).toBe(expected)
  })

  it('reports a readable error when a v1 media item has no path', () => {
    const broken = sampleV1Project()
    ;(broken.media[1] as { path?: string }).path = undefined
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual({
      code: 'MIGRATION_FAILED',
      message: 'The project could not be upgraded from format 1 to 2: media item 2 has no "path".'
    })
  })

  it('reports a readable error when v1 media is not a list', () => {
    const result = loadProject({ ...sampleV1Project(), media: 'nope' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MIGRATION_FAILED')
    expect(result.error.message).toContain('"media" is not a list')
  })

  it('still validates the upgraded result and rejects what the migration cannot fix', () => {
    const broken = { ...sampleV1Project(), name: '' }
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_PROJECT')
    expect(result.error.message).toContain('name:')
  })
})

describe('migration runner', () => {
  it('applies migrations in order, each one fed the previous output', () => {
    const applied: string[] = []
    const chain: ProjectMigration[] = [
      {
        from: 2,
        to: 3,
        up: (data) => {
          applied.push('2->3')
          return { ...(data as object), step: 3 }
        }
      },
      {
        from: 1,
        to: 2,
        up: (data) => {
          applied.push('1->2')
          return { ...(data as object), step: 2 }
        }
      }
    ]
    const result = migrateToVersion({ schemaVersion: 1 }, { currentVersion: 3, migrations: chain })
    expect(result).toEqual({
      ok: true,
      value: { data: { schemaVersion: 1, step: 3 }, fromVersion: 1, toVersion: 3 }
    })
    expect(applied).toEqual(['1->2', '2->3'])
  })

  it('does nothing when the file is already at the current version', () => {
    const migrate = (version: number) =>
      migrateToVersion(
        { schemaVersion: version },
        {
          currentVersion: 2,
          migrations: [{ from: 1, to: 2, up: () => 'should not run' }]
        }
      )
    expect(migrate(2)).toEqual({
      ok: true,
      value: { data: { schemaVersion: 2 }, fromVersion: 2, toVersion: 2 }
    })
  })

  it('refuses a file saved by a newer app instead of guessing', () => {
    const result = loadProject({ ...sampleV1Project(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('UNSUPPORTED_VERSION')
    expect(result.error.message).toContain(`project format ${CURRENT_SCHEMA_VERSION + 1}`)
    expect(result.error.message).toContain('Update the app')
  })

  it('reports a missing step in the chain', () => {
    const result = migrateToVersion(
      { schemaVersion: 1 },
      { currentVersion: 3, migrations: [{ from: 2, to: 3, up: (data) => data }] }
    )
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'MIGRATION_MISSING',
        message: 'No upgrade is available from project format 1 to 3.'
      }
    })
  })

  it('stops at the first migration that throws and does not run later ones', () => {
    const ran: number[] = []
    const result = migrateToVersion(
      { schemaVersion: 1 },
      {
        currentVersion: 3,
        migrations: [
          {
            from: 1,
            to: 2,
            up: () => {
              throw new Error('boom')
            }
          },
          {
            from: 2,
            to: 3,
            up: (data) => {
              ran.push(3)
              return data
            }
          }
        ]
      }
    )
    expect(result.ok).toBe(false)
    expect(ran).toEqual([])
  })

  it('ships with the v1 -> v2 migration registered', () => {
    expect(projectMigrations).toContainEqual({ from: 1, to: 2, up: migrateV1ToV2 })
  })
})
