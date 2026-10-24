import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, projectSchema } from '@shared/project/schema'
import { loadProject, loadProjectText } from '@shared/project/loadProject'

function sampleProject() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:30:00.000Z',
    media: [
      {
        id: 'media_1',
        path: 'footage/interview.mp4',
        pathKind: 'relative',
        fileName: 'interview.mp4',
        sizeBytes: 1_048_576,
        durationMs: 61_000,
        kind: 'video'
      }
    ],
    defaults: {
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'youtube',
      safeZones: true
    },
    shorts: [
      {
        id: 'short_1',
        name: 'Intro hook',
        createdAt: '2026-10-23T09:10:00.000Z',
        updatedAt: '2026-10-23T09:20:00.000Z',
        status: 'draft',
        order: 0,
        targetLength: { minSec: 30, maxSec: 60 },
        platform: 'youtube',
        overrides: {},
        editedSinceExport: false,
        timeline: { tracks: [{ kind: 'video' }] }
      }
    ],
    scripts: [{ id: 'script_1', name: 'Hook options', lines: ['Opening line', { text: 'x' }] }]
  }
}

describe('project schema: valid load', () => {
  it('loads a current-version project unchanged and reports no migration', () => {
    const result = loadProject(sampleProject())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.migrated).toBe(false)
    expect(result.value.fromVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.value.toVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.value.project).toEqual(sampleProject())
  })

  it('keeps unknown keys inside the timeline and script lines placeholders', () => {
    const result = loadProject(sampleProject())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.project.shorts[0].timeline).toEqual({ tracks: [{ kind: 'video' }] })
    expect(result.value.project.scripts[0].lines).toEqual(['Opening line', { text: 'x' }])
  })

  it('accepts a project with no media, shorts or scripts', () => {
    const empty = { ...sampleProject(), media: [], shorts: [], scripts: [] }
    expect(loadProject(empty).ok).toBe(true)
  })

  it('loads project.json text', () => {
    const result = loadProjectText(JSON.stringify(sampleProject()))
    expect(result.ok).toBe(true)
  })

  it('exposes inferred types from the schema', () => {
    const parsed = projectSchema.parse(sampleProject())
    const status: 'draft' | 'ready' | 'exported' = parsed.shorts[0].status
    expect(status).toBe('draft')
  })
})

describe('project schema: invalid files are rejected with a readable error', () => {
  it('rejects text that is not JSON', () => {
    const result = loadProjectText('{ "schemaVersion": 2, ')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_JSON')
    expect(result.error.message).toMatch(/^The project file is not valid JSON \(.+\)\.$/)
  })

  it('rejects a file that is not a JSON object', () => {
    const result = loadProject(['not', 'a', 'project'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toEqual({
      code: 'INVALID_PROJECT',
      message: 'The project file must contain a JSON object.'
    })
  })

  it('rejects a file with no schemaVersion', () => {
    const withoutVersion: Record<string, unknown> = { ...sampleProject() }
    delete withoutVersion.schemaVersion
    const result = loadProject(withoutVersion)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_PROJECT')
    expect(result.error.message).toBe('The project file has no valid "schemaVersion".')
  })

  it('names the field and the problem for a bad value', () => {
    const broken = sampleProject()
    broken.media[0].sizeBytes = -5
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_PROJECT')
    expect(result.error.message).toContain('The project file is invalid.')
    expect(result.error.message).toContain('media.0.sizeBytes:')
  })

  it('names a missing required field', () => {
    const broken: Record<string, unknown> = { ...sampleProject() }
    delete broken.name
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('name:')
  })

  it('reports a bad enum value on a short', () => {
    const broken = sampleProject()
    ;(broken.shorts[0] as { status: string }).status = 'published'
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('shorts.0.status:')
  })

  it('caps the number of issues listed and says how many were left out', () => {
    const broken = sampleProject()
    broken.media = Array.from({ length: 8 }, (_v, index) => ({
      ...broken.media[0],
      id: `media_${index}`,
      sizeBytes: -1
    }))
    const result = loadProject(broken)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toContain('...and 3 more')
  })
})
