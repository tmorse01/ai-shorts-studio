import { describe, expect, it } from 'vitest'
import {
  alignShortPlan,
  applyReusePolicy,
  buildShortsPrompt,
  fitsTarget,
  generateShortsInputSchema,
  generatedShortSchema,
  parseShortsReply,
  shortLengthMs,
  shortsRequestSchema,
  type GeneratedShort,
  type ShortsRequest,
  type ShortsSourceFootage
} from '@shared/shorts/shortPlan'

const request: ShortsRequest = {
  count: 3,
  momentsPerShort: { min: 4, max: 6 },
  targetLength: { minSec: 30, maxSec: 60 },
  angle: '',
  avoidReuse: true
}

const moment = (mediaId: string, inMs: number, outMs: number) => ({
  mediaId,
  name: `Moment ${inMs}`,
  inMs,
  outMs
})

describe('shorts request schema', () => {
  it('accepts the defaults and rejects a count over five or an inverted moment range', () => {
    expect(shortsRequestSchema.safeParse(request).success).toBe(true)
    expect(shortsRequestSchema.safeParse({ ...request, count: 6 }).success).toBe(false)
    expect(
      shortsRequestSchema.safeParse({ ...request, momentsPerShort: { min: 6, max: 4 } }).success
    ).toBe(false)
  })

  it('refuses a source listed twice in one request', () => {
    const source = { mediaId: 'm1', fileName: 'a.mp4' }
    const result = generateShortsInputSchema.safeParse({
      projectFolder: 'C:/project',
      sources: [source, source],
      existingMoments: [],
      request
    })
    expect(result.success).toBe(false)
  })
})

describe('generated short schema', () => {
  it('needs a title, a hook and at least one moment', () => {
    const base = { title: 'Dawn', hook: 'Boats leave', moments: [moment('m1', 0, 4000)] }
    expect(generatedShortSchema.safeParse(base).success).toBe(true)
    expect(generatedShortSchema.safeParse({ ...base, moments: [] }).success).toBe(false)
    expect(generatedShortSchema.safeParse({ ...base, title: '  ' }).success).toBe(false)
  })
})

describe('parseShortsReply', () => {
  it('reads a fenced reply and drops a moment or short that does not fit the shape', () => {
    const reply = [
      'Here you go:',
      '```json',
      JSON.stringify({
        shorts: [
          {
            title: 'Dawn run',
            hook: 'Boats leave the harbour',
            moments: [
              { mediaId: 'm1', name: 'Launch', startSec: 1, endSec: 9 },
              { mediaId: 'm1', name: 'Broken', startSec: 9, endSec: 3 }
            ]
          },
          { title: 'No moments', hook: 'x', moments: [] },
          { hook: 'no title', moments: [{ mediaId: 'm1', name: 'A', startSec: 1, endSec: 2 }] }
        ]
      }),
      '```'
    ].join('\n')

    const parsed = parseShortsReply(reply)
    expect(parsed).toEqual([
      {
        title: 'Dawn run',
        hook: 'Boats leave the harbour',
        moments: [{ mediaId: 'm1', name: 'Launch', startSec: 1, endSec: 9 }]
      }
    ])
  })

  it('reads an empty list as no shorts, and returns undefined for a reply with no JSON object', () => {
    expect(parseShortsReply('{"shorts": []}')).toEqual([])
    expect(parseShortsReply('Sorry, I cannot help.')).toBeUndefined()
    expect(parseShortsReply('{"shorts": "nope"}')).toBeUndefined()
  })
})

describe('alignShortPlan', () => {
  const footage: Record<string, ShortsSourceFootage & { durationMs?: number }> = {
    m1: {
      durationMs: 60000,
      shots: [
        { shotIndex: 0, startSec: 0, endSec: 10 },
        { shotIndex: 1, startSec: 10, endSec: 30 }
      ],
      segments: [],
      suggestions: []
    }
  }

  it('snaps moment edges onto shot boundaries and drops moments from unknown sources', () => {
    const shorts = alignShortPlan(
      [
        {
          title: 'Dawn run',
          hook: 'h',
          moments: [
            { mediaId: 'm1', name: 'Launch', startSec: 0.4, endSec: 29.6 },
            { mediaId: 'gone', name: 'Ghost', startSec: 1, endSec: 9 }
          ]
        }
      ],
      footage
    )
    expect(shorts).toHaveLength(1)
    expect(shorts[0]?.moments).toEqual([{ mediaId: 'm1', name: 'Launch', inMs: 0, outMs: 30000 }])
  })

  it('drops a moment that is too short after snapping, and a short left empty', () => {
    const shorts = alignShortPlan(
      [
        {
          title: 'Tiny',
          hook: '',
          moments: [{ mediaId: 'm1', name: 'Blip', startSec: 1, endSec: 2 }]
        }
      ],
      footage
    )
    expect(shorts).toEqual([])
  })
})

describe('applyReusePolicy', () => {
  const first: GeneratedShort = {
    title: 'One',
    hook: '',
    moments: [moment('m1', 0, 5000), moment('m1', 5000, 9000)]
  }
  const second: GeneratedShort = {
    title: 'Two',
    hook: '',
    moments: [moment('m1', 0, 5000), moment('m1', 12000, 16000)]
  }

  it('keeps a moment once in its own short and removes repeats from later shorts when reuse is avoided', () => {
    const out = applyReusePolicy([first, second], true)
    expect(out[0]?.moments.map((item) => item.inMs)).toEqual([0, 5000])
    expect(out[1]?.moments.map((item) => item.inMs)).toEqual([12000])
  })

  it('drops a short that has nothing left once its moments are used earlier', () => {
    const repeat: GeneratedShort = { title: 'Again', hook: '', moments: [moment('m1', 0, 5000)] }
    expect(applyReusePolicy([first, repeat], true).map((item) => item.title)).toEqual(['One'])
  })

  it('lets shorts share moments when reuse is allowed, but still keeps a repeat inside one short', () => {
    const out = applyReusePolicy([first, second], false)
    expect(out[1]?.moments.map((item) => item.inMs)).toEqual([0, 12000])
    const doubled: GeneratedShort = {
      title: 'Doubled',
      hook: '',
      moments: [moment('m1', 0, 5000), moment('m1', 0, 5000)]
    }
    expect(applyReusePolicy([doubled], false)[0]?.moments).toHaveLength(1)
  })
})

describe('length against the target', () => {
  it('sums the moments and reports under, within or over the target', () => {
    const short: GeneratedShort = {
      title: 'Sum',
      hook: '',
      moments: [moment('m1', 0, 20000), moment('m1', 30000, 45000)]
    }
    expect(shortLengthMs(short)).toBe(35000)
    expect(fitsTarget(shortLengthMs(short), { minSec: 30, maxSec: 60 })).toBe('within')
    expect(fitsTarget(10000, { minSec: 30, maxSec: 60 })).toBe('under')
    expect(fitsTarget(70000, { minSec: 30, maxSec: 60 })).toBe('over')
  })
})

describe('buildShortsPrompt', () => {
  it('names the count, the target, the angle, the sources, the existing moments and the reply format', () => {
    const prompt = buildShortsPrompt({
      request: { ...request, angle: 'the big jumps' },
      sources: [
        {
          mediaId: 'm1',
          fileName: 'dock.mp4',
          footage: {
            segments: [{ startMs: 1500, endMs: 3000, text: 'We jump now' }],
            shots: [{ shotIndex: 0, startSec: 0, endSec: 4, description: 'Water splash' }],
            suggestions: []
          }
        }
      ],
      existingMoments: [{ mediaId: 'm1', name: 'Splash', inMs: 0, outMs: 4000 }]
    })
    expect(prompt).toContain('Propose 3 shorts')
    expect(prompt).toContain('Angle: the big jumps')
    expect(prompt).toContain('[1.5s] We jump now')
    expect(prompt).toContain('Shot 0 (0.0s to 4.0s): Water splash')
    expect(prompt).toContain('m1 "Splash" (0.0s to 4.0s)')
    expect(prompt).toContain('"shorts"')
  })
})
