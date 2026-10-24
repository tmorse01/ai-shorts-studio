import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import {
  EMPTY_MEDIA_FILTER,
  filterMedia,
  isMediaFilterActive
} from '@renderer/features/media/mediaView'
import { mediaPanelStore } from '@renderer/features/media/mediaPanelStore'

const ref = (
  fileName: string,
  kind: MediaRef['kind'],
  durationMs: number | undefined,
  tagIds?: string[]
): MediaRef => ({
  id: fileName,
  path: `G:\\Footage\\${fileName}`,
  pathKind: 'absolute',
  fileName,
  sizeBytes: 1,
  kind,
  durationMs,
  tagIds
})

const media = [
  ref('Interview_A.mp4', 'video', 61_000, ['a-roll']),
  ref('Drone_Coast.mp4', 'video', 12_000, ['b-roll']),
  ref('theme.mp3', 'audio', 180_000),
  ref('logo.png', 'image', undefined, ['b-roll'])
]

const names = (items: MediaRef[]) => items.map((item) => item.fileName)

describe('filterMedia', () => {
  it('keeps everything with an empty filter', () => {
    expect(filterMedia(media, EMPTY_MEDIA_FILTER)).toEqual(media)
    expect(isMediaFilterActive(EMPTY_MEDIA_FILTER)).toBe(false)
  })

  it('searches names without case and ignores a blank query', () => {
    expect(names(filterMedia(media, { ...EMPTY_MEDIA_FILTER, query: ' DRONE ' }))).toEqual([
      'Drone_Coast.mp4'
    ])
    expect(filterMedia(media, { ...EMPTY_MEDIA_FILTER, query: '   ' })).toHaveLength(4)
  })

  it('filters by type', () => {
    expect(names(filterMedia(media, { ...EMPTY_MEDIA_FILTER, kinds: ['audio', 'image'] }))).toEqual(
      ['theme.mp3', 'logo.png']
    )
  })

  it('matches any chosen tag', () => {
    expect(
      names(filterMedia(media, { ...EMPTY_MEDIA_FILTER, tagIds: ['a-roll', 'b-roll'] }))
    ).toEqual(['Interview_A.mp4', 'Drone_Coast.mp4', 'logo.png'])
  })

  it('applies a duration range in seconds and drops files with no known duration', () => {
    const filter = { ...EMPTY_MEDIA_FILTER, minDurationSec: 10, maxDurationSec: 100 }
    expect(names(filterMedia(media, filter))).toEqual(['Interview_A.mp4', 'Drone_Coast.mp4'])
    expect(names(filterMedia(media, { ...EMPTY_MEDIA_FILTER, minDurationSec: 0 }))).toEqual([
      'Interview_A.mp4',
      'Drone_Coast.mp4',
      'theme.mp3'
    ])
  })

  it('combines every active part of the filter', () => {
    const filter = {
      ...EMPTY_MEDIA_FILTER,
      query: 'o',
      kinds: ['video' as const],
      tagIds: ['b-roll']
    }
    expect(names(filterMedia(media, filter))).toEqual(['Drone_Coast.mp4'])
    expect(isMediaFilterActive(filter)).toBe(true)
  })
})

describe('mediaPanelStore filters', () => {
  it('keeps a filter per project folder and clears only that one', () => {
    const store = mediaPanelStore.getState()
    store.setFilter('G:/one', { query: 'drone' })
    store.setFilter('G:/two', { kinds: ['audio'] })
    store.setFilter('G:/one', { tagIds: ['a-roll'] })

    const state = mediaPanelStore.getState()
    expect(state.filterByProject['G:/one']).toEqual({
      query: 'drone',
      kinds: [],
      tagIds: ['a-roll']
    })
    expect(state.filterByProject['G:/two']?.kinds).toEqual(['audio'])

    store.clearFilter('G:/one')
    expect(mediaPanelStore.getState().filterByProject['G:/one']).toEqual(EMPTY_MEDIA_FILTER)
    expect(mediaPanelStore.getState().filterByProject['G:/two']?.kinds).toEqual(['audio'])
  })
})
