import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { projectSchema, type MediaRef, type Project } from '@shared/project/schema'
import { importMediaCommand } from '@renderer/features/media/mediaCommands'

const project: Project = projectSchema.parse({
  schemaVersion: 3,
  id: 'p1',
  name: 'Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  media: [],
  defaults: {
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    safeZones: true
  },
  shorts: [],
  scripts: []
})

const ref: MediaRef = {
  id: 'm1',
  path: 'G:\\Footage\\clip.mp4',
  pathKind: 'absolute',
  fileName: 'clip.mp4',
  sizeBytes: 100,
  kind: 'video'
}

describe('importMediaCommand', () => {
  it('appends the refs as pending media with no duration', () => {
    const next = produce(project, (draft) => importMediaCommand([ref]).produce(draft))
    expect(next.media).toEqual([ref])
    expect(next.media[0]?.durationMs).toBeUndefined()
  })

  it('names the command by how many files it imports', () => {
    expect(importMediaCommand([ref]).label).toBe('Import 1 file')
    expect(importMediaCommand([ref, { ...ref, id: 'm2' }]).label).toBe('Import 2 files')
  })

  it('leaves the other project fields untouched', () => {
    const next = produce(project, (draft) => importMediaCommand([ref]).produce(draft))
    expect(next.shorts).toEqual(project.shorts)
    expect(next.defaults).toEqual(project.defaults)
  })
})
