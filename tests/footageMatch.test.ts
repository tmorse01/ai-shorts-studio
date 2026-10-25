import { describe, expect, it } from 'vitest'
import {
  buildFootagePlan,
  buildFootageMatchPrompt,
  candidatesForLine,
  parseMatchReply,
  prepareFootageMatch,
  shotBoundariesMs,
  snapCut,
  type FootageMatchRequest,
  type FootageSources
} from '@shared/assembly/footageMatch'
import { SearchIndex, type SearchDoc } from '@shared/search/searchIndex'

const docs: SearchDoc[] = [
  {
    id: 'm1:shot:0',
    mediaId: 'm1',
    kind: 'shot',
    text: 'Fishing boats leave the harbour at dawn',
    startMs: 0,
    endMs: 6000
  },
  {
    id: 'm1:shot:1',
    mediaId: 'm1',
    kind: 'shot',
    text: 'A crowded market with fish stalls',
    startMs: 6000,
    endMs: 12000
  },
  {
    id: 'm2:segment:0',
    mediaId: 'm2',
    kind: 'segment',
    text: 'The lighthouse keeper waves at the boats',
    startMs: 4000,
    endMs: 9000
  }
]

function indexWith(items: SearchDoc[]): SearchIndex {
  const index = new SearchIndex()
  index.replaceGroup(
    'm1',
    items.filter((doc) => doc.mediaId === 'm1')
  )
  index.replaceGroup(
    'm2',
    items.filter((doc) => doc.mediaId === 'm2')
  )
  return index
}

describe('candidatesForLine', () => {
  it('finds clips for the content words of a line and ignores stop words', () => {
    const hits = candidatesForLine(indexWith(docs), 'The boats leave the harbour')
    expect(hits[0].id).toBe('m1:shot:0')
  })

  it('falls back to single words when the whole line matches nothing', () => {
    const hits = candidatesForLine(indexWith(docs), 'boats and lighthouse keeper')
    expect(hits.map((hit) => hit.id)).toEqual(expect.arrayContaining(['m2:segment:0']))
  })

  it('returns nothing for a line of stop words only', () => {
    expect(candidatesForLine(indexWith(docs), 'the and of')).toEqual([])
  })
})

describe('snapCut', () => {
  const boundaries = [0, 2000, 5000, 9000, 14000]

  it('moves the in point back and the out point forward to shot boundaries', () => {
    expect(snapCut(2500, 4200, boundaries, 14000)).toEqual({ inMs: 2000, outMs: 5000 })
  })

  it('ends a long cut on the last boundary that keeps it within six seconds', () => {
    expect(snapCut(0, 13000, boundaries, 14000)).toEqual({ inMs: 0, outMs: 5000 })
  })

  it('grows a short cut to a boundary within six seconds', () => {
    expect(snapCut(2100, 2400, [0, 2000, 2500, 5000, 14000], 14000)).toEqual({
      inMs: 2000,
      outMs: 5000
    })
  })

  it('cuts to six seconds when no boundary fits, and to three when none is near', () => {
    expect(snapCut(0, 9000, [0, 9000, 14000], 14000)).toEqual({ inMs: 0, outMs: 6000 })
    expect(snapCut(0, 500, [0, 1000, 14000], 14000)).toEqual({ inMs: 0, outMs: 3000 })
  })

  it('keeps the cut inside the media when growing it would pass the end', () => {
    expect(snapCut(11500, 11800, [0, 10000, 12000], 12000)).toEqual({ inMs: 9000, outMs: 12000 })
  })

  it('limits the length alone when there is no shot data', () => {
    expect(snapCut(1000, 20000, [], 30000)).toEqual({ inMs: 1000, outMs: 7000 })
  })

  it('returns null for media shorter than three seconds', () => {
    expect(snapCut(0, 2000, [0, 2000], 2000)).toBeNull()
  })
})

describe('shotBoundariesMs', () => {
  it('lists every shot edge in milliseconds once, sorted', () => {
    expect(
      shotBoundariesMs([
        { startSec: 0, endSec: 2.5 },
        { startSec: 2.5, endSec: 6 }
      ])
    ).toEqual([0, 2500, 6000])
  })

  it('is empty when there are no shots', () => {
    expect(shotBoundariesMs([])).toEqual([])
  })
})

describe('prepareFootageMatch and parseMatchReply', () => {
  const sources = (index: SearchIndex): FootageSources => ({
    index,
    mediaNames: { m1: 'dock.mp4', m2: 'light.mp4' },
    shots: {},
    durationsMs: { m1: 12000, m2: 9000 }
  })

  it('gives each line its candidates with unique ids and sends only lines that have some', () => {
    const prepared = prepareFootageMatch({
      ...sources(indexWith(docs)),
      lines: [
        { lineId: 'L1', text: 'Boats leave the harbour' },
        { lineId: 'L2', text: 'the and of' }
      ],
      targetMs: 30000
    })
    const ids = prepared.request.lines.flatMap((line) => line.candidates.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(prepared.request.lines[1].candidates).toEqual([])
    expect(prepared.promptLineCount).toBe(1)
    expect(prepared.prompt).toContain('<line id="L1"')
    expect(prepared.prompt).not.toContain('<line id="L2"')
    expect(prepared.prompt).toContain('about 30 seconds')
  })

  it('reads picks, drops unknown lines and candidates, and keeps the first pick per line', () => {
    const request: FootageMatchRequest = {
      targetMs: null,
      lines: [
        {
          lineId: 'L1',
          text: 'x',
          candidates: [
            {
              id: 'c1',
              mediaId: 'm1',
              mediaName: 'a',
              kind: 'shot',
              text: '',
              startMs: 0,
              endMs: 6000
            },
            {
              id: 'c2',
              mediaId: 'm2',
              mediaName: 'b',
              kind: 'segment',
              text: '',
              startMs: 0,
              endMs: 6000
            }
          ]
        }
      ]
    }
    const reply = JSON.stringify({
      lines: [
        { lineId: 'L1', candidateId: 'c9', inMs: 0, outMs: 4000 },
        { lineId: 'L1', candidateId: 'c2', inMs: 0, outMs: 4000, alternatives: ['c1', 'c1', 'c2'] },
        { lineId: 'L1', candidateId: 'c1', inMs: 0, outMs: 4000 },
        { lineId: 'L7', candidateId: 'c1', inMs: 0, outMs: 4000 }
      ]
    })
    expect(parseMatchReply(`Here you go:\n${reply}`, request)).toEqual([
      { lineId: 'L1', candidateId: 'c2', inMs: 0, outMs: 4000, alternatives: ['c1'] }
    ])
  })

  it('returns null when the reply holds no JSON of the right shape', () => {
    const request: FootageMatchRequest = { lines: [], targetMs: null }
    expect(parseMatchReply('no json here', request)).toBeNull()
    expect(parseMatchReply('{"other": 1}', request)).toBeNull()
  })
})

describe('buildFootagePlan', () => {
  it('builds snapped cuts, lists unmatched lines, and checks the total against the target', () => {
    const request: FootageMatchRequest = {
      targetMs: 8000,
      lines: [
        {
          lineId: 'L1',
          text: 'a',
          candidates: [
            {
              id: 'c1',
              mediaId: 'm1',
              mediaName: 'dock.mp4',
              kind: 'shot',
              text: '',
              startMs: 0,
              endMs: 6000
            }
          ]
        },
        { lineId: 'L2', text: 'b', candidates: [] }
      ]
    }
    const sources: FootageSources = {
      index: new SearchIndex(),
      mediaNames: { m1: 'dock.mp4' },
      shots: {
        m1: [
          { startSec: 0, endSec: 4 },
          { startSec: 4, endSec: 12 }
        ]
      },
      durationsMs: { m1: 12000 }
    }
    const result = buildFootagePlan(
      request,
      [{ lineId: 'L1', candidateId: 'c1', inMs: 1000, outMs: 2000, alternatives: [] }],
      sources
    )
    expect(result.plan.lines).toEqual([
      {
        lineId: 'L1',
        cuts: [{ sourceId: 'm1', inMs: 0, outMs: 4000, role: 'a', alternatives: [] }]
      }
    ])
    expect(result.unmatchedLineIds).toEqual(['L2'])
    expect(result.totalMs).toBe(4000)
    expect(result.targetHit).toBe(false)
  })

  it('reports no target check when the script has no target length', () => {
    const result = buildFootagePlan({ lines: [], targetMs: null }, [], {
      index: new SearchIndex(),
      mediaNames: {},
      shots: {},
      durationsMs: {}
    })
    expect(result.targetHit).toBeNull()
  })
})

describe('buildFootageMatchPrompt', () => {
  it('names the reply shape and asks for JSON only', () => {
    const prompt = buildFootageMatchPrompt([], null)
    expect(prompt).toContain('JSON only')
    expect(prompt).toContain('"candidateId"')
  })
})
