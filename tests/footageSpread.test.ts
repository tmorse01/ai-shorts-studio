import { describe, expect, it } from 'vitest'
import type { AssemblyPlan } from '@shared/assembly/assemblyPlan'
import {
  overlapsUsed,
  spreadCandidates,
  usedRangesOfPlan,
  type UsedRange
} from '@shared/assembly/footageSpread'
import { candidatesForLine } from '@shared/assembly/footageMatch'
import { SearchIndex, type SearchDoc } from '@shared/search/searchIndex'

const used: UsedRange[] = [{ mediaId: 'm1', startMs: 4000, endMs: 8000 }]

describe('overlapsUsed', () => {
  it('counts a range that shares any footage with a used range of the same media', () => {
    expect(overlapsUsed('m1', 7000, 9000, used)).toBe(true)
    expect(overlapsUsed('m1', 0, 4500, used)).toBe(true)
    expect(overlapsUsed('m1', 3000, 9000, used)).toBe(true)
  })

  it('leaves alone ranges that only touch the used range, or use other media', () => {
    expect(overlapsUsed('m1', 8000, 9000, used)).toBe(false)
    expect(overlapsUsed('m1', 0, 4000, used)).toBe(false)
    expect(overlapsUsed('m2', 4000, 8000, used)).toBe(false)
  })
})

describe('spreadCandidates', () => {
  const hit = (id: string, mediaId: string, startMs: number, endMs: number) => ({
    id,
    mediaId,
    startMs,
    endMs
  })

  it('moves candidates that reuse footage behind fresh ones, keeping each group in order', () => {
    const candidates = [
      hit('a', 'm1', 5000, 7000),
      hit('b', 'm2', 0, 3000),
      hit('c', 'm1', 20000, 23000),
      hit('d', 'm3', 0, 3000)
    ]
    expect(spreadCandidates(candidates, used).map((c) => c.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('keeps the order when nothing is used, so reuse-on matching is unchanged', () => {
    const candidates = [hit('a', 'm1', 5000, 7000), hit('b', 'm2', 0, 3000)]
    expect(spreadCandidates(candidates, [])).toEqual(candidates)
  })

  it('still offers every candidate when all of them reuse footage', () => {
    const candidates = [hit('a', 'm1', 5000, 7000), hit('b', 'm1', 6000, 8000)]
    expect(spreadCandidates(candidates, used).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('usedRangesOfPlan', () => {
  it('lists the source range of every cut in the plan', () => {
    const plan: AssemblyPlan = {
      lines: [
        {
          lineId: 'l1',
          cuts: [{ sourceId: 'm1', inMs: 1000, outMs: 4000, role: 'a', alternatives: [] }]
        },
        {
          lineId: 'l2',
          cuts: [{ sourceId: 'm2', inMs: 0, outMs: 3000, role: 'a', alternatives: [] }]
        }
      ]
    }
    expect(usedRangesOfPlan(plan)).toEqual([
      { mediaId: 'm1', startMs: 1000, endMs: 4000 },
      { mediaId: 'm2', startMs: 0, endMs: 3000 }
    ])
  })
})

describe('candidatesForLine with used footage', () => {
  const doc = (id: string, mediaId: string, startMs: number): SearchDoc => ({
    id,
    mediaId,
    kind: 'segment',
    text: 'river crossing at dawn',
    startMs,
    endMs: startMs + 3000
  })

  it('tries fresh footage first, and keeps the reused clip as a fallback', () => {
    const index = new SearchIndex()
    index.replaceGroup('m1', [doc('d1', 'm1', 4000), doc('d2', 'm1', 30000)])
    const reuse = candidatesForLine(index, 'river crossing', 8, [])
    expect(reuse[0].startMs).toBe(4000)

    const spread = candidatesForLine(index, 'river crossing', 8, [
      { mediaId: 'm1', startMs: 4000, endMs: 7000 }
    ])
    expect(spread.map((hit) => hit.startMs)).toEqual([30000, 4000])
  })
})
