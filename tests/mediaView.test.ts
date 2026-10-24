import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  projectSchema,
  type MediaRef,
  type Project
} from '@shared/project/schema'
import {
  EMPTY_SELECTION,
  formatDuration,
  removeMediaCommand,
  selectItem,
  sortMedia
} from '@renderer/features/media/mediaView'

const ref = (id: string, fileName: string, durationMs?: number, sizeBytes = 1): MediaRef => ({
  id,
  path: `G:\\Footage\\${fileName}`,
  pathKind: 'absolute',
  fileName,
  sizeBytes,
  durationMs,
  kind: 'video'
})

const project: Project = projectSchema.parse({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'p1',
  name: 'Test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  mediaTags: [],
  media: [ref('a', 'b.mp4', 61_000), ref('b', 'a.mp4', 5_000), ref('c', 'c.mp4')],
  defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
  shorts: [],
  scripts: []
})

describe('formatDuration', () => {
  it('shows minutes and seconds, or a dash while unknown', () => {
    expect(formatDuration(61_000)).toBe('1:01')
    expect(formatDuration(5_000)).toBe('0:05')
    expect(formatDuration(undefined)).toBe('—')
  })
})

describe('sortMedia', () => {
  it('sorts by name in both directions without changing the input', () => {
    const names = (media: readonly MediaRef[]) => media.map((m) => m.fileName)
    expect(names(sortMedia(project.media, 'name', 'asc'))).toEqual(['a.mp4', 'b.mp4', 'c.mp4'])
    expect(names(sortMedia(project.media, 'name', 'desc'))).toEqual(['c.mp4', 'b.mp4', 'a.mp4'])
    expect(names(project.media)).toEqual(['b.mp4', 'a.mp4', 'c.mp4'])
  })

  it('puts unknown durations first when sorting by duration ascending', () => {
    expect(sortMedia(project.media, 'duration', 'asc').map((m) => m.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('selectItem', () => {
  const order = ['a', 'b', 'c', 'd']

  it('replaces the selection on a plain click', () => {
    const first = selectItem(EMPTY_SELECTION, 'a', {}, order)
    expect(selectItem(first, 'c', {}, order)).toEqual({ ids: ['c'], anchor: 'c' })
  })

  it('adds and removes one item with Ctrl', () => {
    const one = selectItem(EMPTY_SELECTION, 'a', {}, order)
    const two = selectItem(one, 'c', { additive: true }, order)
    expect(two.ids).toEqual(['a', 'c'])
    expect(selectItem(two, 'a', { additive: true }, order).ids).toEqual(['c'])
  })

  it('selects the range between the anchor and the clicked item with Shift', () => {
    const anchored = selectItem(EMPTY_SELECTION, 'b', {}, order)
    expect(selectItem(anchored, 'd', { range: true }, order).ids).toEqual(['b', 'c', 'd'])
    expect(selectItem(anchored, 'a', { range: true }, order).ids).toEqual(['a', 'b'])
  })
})

describe('removeMediaCommand', () => {
  it('removes the chosen media and keeps the rest in order', () => {
    const next = produce(project, (draft) => removeMediaCommand(['a', 'c']).produce(draft))
    expect(next.media.map((m) => m.id)).toEqual(['b'])
  })

  it('names the command by how many files it removes', () => {
    expect(removeMediaCommand(['a']).label).toBe('Remove 1 file')
    expect(removeMediaCommand(['a', 'b']).label).toBe('Remove 2 files')
  })
})
