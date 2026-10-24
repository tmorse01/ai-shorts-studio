import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  projectSchema,
  type MediaRef,
  type Project
} from '@shared/project/schema'
import {
  allMediaTags,
  createTagCommand,
  deleteTagCommand,
  isTagNameTaken,
  renameTagCommand,
  setMediaTagCommand,
  tagCoverage,
  tagsOfMedia
} from '@renderer/features/media/mediaTags'

const ref = (id: string, tagIds?: string[]): MediaRef => ({
  id,
  path: `G:\\Footage\\${id}.mp4`,
  pathKind: 'absolute',
  fileName: `${id}.mp4`,
  sizeBytes: 1,
  kind: 'video',
  tagIds
})

function projectWith(media: MediaRef[], mediaTags: { id: string; name: string }[] = []): Project {
  return projectSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'p1',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    media,
    mediaTags,
    moments: [],
    defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
    shorts: [],
    scripts: []
  })
}

describe('built-in and custom tags', () => {
  it('lists the quick tags first, then custom tags', () => {
    const project = projectWith([], [{ id: 'c1', name: 'Interview' }])
    expect(allMediaTags(project).map((tag) => tag.name)).toEqual([
      'A-roll',
      'B-roll',
      'Music',
      'Interview'
    ])
  })

  it('treats names as taken regardless of case and spaces', () => {
    const project = projectWith([], [{ id: 'c1', name: 'Crowd Shots' }])
    expect(isTagNameTaken(project, 'crowdshots')).toBe(true)
    expect(isTagNameTaken(project, 'a-roll')).toBe(true)
    expect(isTagNameTaken(project, 'Crowd Shots', 'c1')).toBe(false)
    expect(isTagNameTaken(project, 'Drone')).toBe(false)
  })

  it('returns the tag chips for a file and skips ids that no longer exist', () => {
    const project = projectWith([], [{ id: 'c1', name: 'Interview' }])
    expect(tagsOfMedia(ref('m', ['b-roll', 'gone', 'c1']), project).map((t) => t.id)).toEqual([
      'b-roll',
      'c1'
    ])
  })
})

describe('tag commands', () => {
  it('creates a custom tag with a trimmed name', () => {
    const next = produce(projectWith([]), (draft) =>
      createTagCommand('c1', '  Drone  ').produce(draft)
    )
    expect(next.mediaTags).toEqual([{ id: 'c1', name: 'Drone' }])
  })

  it('refuses an empty or duplicate name', () => {
    const project = projectWith([], [{ id: 'c1', name: 'Drone' }])
    expect(() => produce(project, (d) => createTagCommand('c2', '   ').produce(d))).toThrow(
      'A tag needs a name.'
    )
    expect(() => produce(project, (d) => createTagCommand('c2', 'drone').produce(d))).toThrow(
      'already exists'
    )
  })

  it('renames a custom tag and keeps its id on files', () => {
    const project = projectWith([ref('m', ['c1'])], [{ id: 'c1', name: 'Drone' }])
    const next = produce(project, (d) => renameTagCommand('c1', 'Aerial').produce(d))
    expect(next.mediaTags).toEqual([{ id: 'c1', name: 'Aerial' }])
    expect(next.media[0]?.tagIds).toEqual(['c1'])
  })

  it('will not rename or delete a quick tag', () => {
    const project = projectWith([])
    expect(() => produce(project, (d) => renameTagCommand('a-roll', 'Cut').produce(d))).toThrow(
      'Quick tags cannot be renamed.'
    )
    expect(() => produce(project, (d) => deleteTagCommand('b-roll').produce(d))).toThrow(
      'Quick tags cannot be deleted.'
    )
  })

  it('deletes a custom tag from the list and from every file', () => {
    const project = projectWith(
      [ref('m1', ['c1', 'a-roll']), ref('m2', ['b-roll'])],
      [{ id: 'c1', name: 'Drone' }]
    )
    const next = produce(project, (d) => deleteTagCommand('c1').produce(d))
    expect(next.mediaTags).toEqual([])
    expect(next.media.map((item) => item.tagIds)).toEqual([['a-roll'], ['b-roll']])
  })

  it('adds and removes a tag on several files in one command', () => {
    const project = projectWith([ref('m1'), ref('m2', ['a-roll']), ref('m3')])
    const added = produce(project, (d) =>
      setMediaTagCommand(['m1', 'm2'], 'a-roll', true).produce(d)
    )
    expect(added.media.map((item) => item.tagIds)).toEqual([['a-roll'], ['a-roll'], undefined])

    const removed = produce(added, (d) =>
      setMediaTagCommand(['m1', 'm2'], 'a-roll', false).produce(d)
    )
    expect(removed.media.map((item) => item.tagIds)).toEqual([[], [], undefined])
  })

  it('reports whether all, some or none of the selection carries a tag', () => {
    const media = [ref('m1', ['a-roll']), ref('m2', ['a-roll']), ref('m3')]
    expect(tagCoverage(media, ['m1', 'm2'], 'a-roll')).toBe('all')
    expect(tagCoverage(media, ['m1', 'm3'], 'a-roll')).toBe('some')
    expect(tagCoverage(media, ['m3'], 'a-roll')).toBe('none')
  })
})
