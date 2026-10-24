import { describe, expect, it } from 'vitest'
import type { Short } from '@shared/project/schema'
import type { Timeline } from '@shared/timeline/timeline'
import { mediaUsageIndex, shortCountForMedia, usedInLabel } from '@shared/timeline/mediaUsage'

const TRANSFORM = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(
  id: string,
  mediaId: string | undefined,
  startMs: number,
  sourceInMs: number,
  durationMs: number
) {
  return { id, mediaId, startMs, sourceInMs, durationMs, transform: TRANSFORM }
}

function timeline(clips: ReturnType<typeof clip>[]): Timeline {
  return {
    tracks: [{ id: 't1', kind: 'video', role: 'main', muted: false, clips }]
  }
}

function short(id: string, tl: Timeline): Short {
  return {
    id,
    name: `Short ${id}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: tl
  } as Short
}

describe('mediaUsageIndex', () => {
  const a = short('a', timeline([clip('c1', 'm1', 0, 1000, 4000), clip('c2', 'm2', 4000, 0, 2000)]))
  const b = short(
    'b',
    timeline([clip('c3', 'm1', 0, 3000, 1000), clip('c4', undefined, 1000, 0, 500)])
  )

  it('lists each short once per footage item it uses', () => {
    const index = mediaUsageIndex([a, b])
    expect(index.get('m1')?.shortIds).toEqual(['a', 'b'])
    expect(index.get('m2')?.shortIds).toEqual(['a'])
  })

  it('counts distinct shorts, so two clips in one short count once', () => {
    const twice = short('x', timeline([clip('p', 'm1', 0, 0, 100), clip('q', 'm1', 100, 500, 100)]))
    const index = mediaUsageIndex([twice])
    expect(shortCountForMedia(index, 'm1')).toBe(1)
    expect(index.get('m1')?.ranges).toHaveLength(2)
  })

  it('derives used source ranges from sourceInMs and duration, sorted by start', () => {
    const index = mediaUsageIndex([a, b])
    expect(index.get('m1')?.ranges).toEqual([
      { startMs: 1000, endMs: 5000, shortIds: ['a'] },
      { startMs: 3000, endMs: 4000, shortIds: ['b'] }
    ])
  })

  it('skips text clips that have no footage', () => {
    const index = mediaUsageIndex([b])
    expect([...index.keys()]).toEqual(['m1'])
  })

  it('reports zero for footage no short uses', () => {
    const index = mediaUsageIndex([a])
    expect(shortCountForMedia(index, 'm9')).toBe(0)
    expect(index.has('m9')).toBe(false)
  })

  it('returns an empty index for no shorts', () => {
    expect(mediaUsageIndex([]).size).toBe(0)
  })
})

describe('usedInLabel', () => {
  it('reads singular and plural, and is empty when unused', () => {
    expect(usedInLabel(0)).toBe('')
    expect(usedInLabel(1)).toBe('Used in 1 short')
    expect(usedInLabel(3)).toBe('Used in 3 shorts')
  })
})
