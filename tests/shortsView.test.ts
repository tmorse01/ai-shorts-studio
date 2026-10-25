import { describe, expect, it } from 'vitest'
import type { Short } from '@shared/project/schema'
import { filterShorts, isShortEmpty, sortShorts } from '@renderer/features/shorts/shortsView'

function short(id: string, patch: Partial<Short>): Short {
  return {
    id,
    name: id,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    status: 'draft',
    order: 0,
    targetLength: { minSec: 30, maxSec: 60 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    timeline: { tracks: [] },
    ...patch
  }
}

const shorts = [
  short('a', { order: 0, updatedAt: '2026-10-02T00:00:00.000Z', status: 'exported' }),
  short('b', { order: 1, updatedAt: '2026-10-05T00:00:00.000Z', status: 'draft' }),
  short('c', { order: 2, updatedAt: '2026-10-03T00:00:00.000Z', status: 'ready' })
]
const maxSec = (s: Short) => (s.id === 'a' ? 90 : s.id === 'b' ? 30 : 60)
const ids = (list: Short[]) => list.map((s) => s.id)

describe('sortShorts', () => {
  it('keeps posting order for Manual, even when the input is unsorted', () => {
    expect(ids(sortShorts([shorts[2], shorts[0], shorts[1]], 'manual', maxSec))).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('puts the newest first for Last updated', () => {
    expect(ids(sortShorts(shorts, 'updated', maxSec))).toEqual(['b', 'c', 'a'])
  })

  it('orders Draft, Ready, Exported for Status, keeping posting order within a status', () => {
    expect(ids(sortShorts(shorts, 'status', maxSec))).toEqual(['b', 'c', 'a'])
  })

  it('puts the shortest target first for Length', () => {
    expect(ids(sortShorts(shorts, 'length', maxSec))).toEqual(['b', 'c', 'a'])
  })

  it('does not change the input array', () => {
    const input = [shorts[1], shorts[0]]
    sortShorts(input, 'updated', maxSec)
    expect(ids(input)).toEqual(['b', 'a'])
  })
})

describe('filterShorts', () => {
  it('keeps every short when no status is chosen', () => {
    expect(filterShorts(shorts, [])).toHaveLength(3)
  })

  it('keeps shorts with any of the chosen statuses', () => {
    expect(ids(filterShorts(shorts, ['draft', 'exported']))).toEqual(['a', 'b'])
  })
})

describe('isShortEmpty', () => {
  it('is true when no track has a clip', () => {
    expect(isShortEmpty(short('a', { timeline: { tracks: [] } }))).toBe(true)
  })

  it('is false as soon as any track has a clip', () => {
    const clip = { id: 'c1' } as unknown as Short['timeline']['tracks'][number]['clips'][number]
    const withClip = short('a', {
      timeline: {
        tracks: [
          { id: 't1', kind: 'video', role: 'main', muted: false, clips: [] },
          { id: 't2', kind: 'audio', role: 'overlay', muted: false, clips: [clip] }
        ]
      }
    })
    expect(isShortEmpty(withClip)).toBe(false)
  })
})
