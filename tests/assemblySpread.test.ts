import { describe, expect, it } from 'vitest'
import type { FootageMatchRequest } from '@shared/assembly/footageMatchRequest'
import type { UsedRange } from '@shared/assembly/footageSpread'
import { createAssemblySpreads } from '../src/main/media/assemblySpread'
import { UserFacingError } from '../src/main/errors'

// A match that records the used ranges it was given and reports one cut per request.
function recordingMatcher() {
  const calls: { lineId: string; used: UsedRange[] }[] = []
  const options = {
    match: async (footage: FootageMatchRequest, used: readonly UsedRange[]) => {
      const lineId = footage.lines[0]?.lineId ?? ''
      calls.push({ lineId, used: [...used] })
      return { cut: { mediaId: `m-${lineId}`, startMs: 0, endMs: 1000 } }
    },
    usedOf: (result: { cut: UsedRange }) => [result.cut]
  }
  return { calls, options }
}

const request = (lineId: string): FootageMatchRequest => ({
  lines: [{ lineId, text: `line ${lineId}` }],
  targetMs: null,
  docs: [],
  mediaNames: {},
  shots: {},
  durationsMs: {}
})

const signal = () => new AbortController().signal

describe('createAssemblySpreads', () => {
  it('gives each later match in a batch the ranges the earlier ones used', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    await spreads.run('batch-1', { footage: request('a'), reuse: false }, signal())
    await spreads.run('batch-1', { footage: request('b'), reuse: false }, signal())
    expect(calls[0].used).toEqual([])
    expect(calls[1].used).toEqual([{ mediaId: 'm-a', startMs: 0, endMs: 1000 }])
  })

  it('runs matches one after another, even when they are started together', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    await Promise.all([
      spreads.run('batch-1', { footage: request('a'), reuse: false }, signal()),
      spreads.run('batch-1', { footage: request('b'), reuse: false }, signal())
    ])
    expect(calls.map((call) => call.lineId)).toEqual(['a', 'b'])
    expect(calls[1].used).toHaveLength(1)
  })

  it('ignores the spread when footage reuse is on, but still records the cuts', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    await spreads.run('batch-1', { footage: request('a'), reuse: true }, signal())
    await spreads.run('batch-1', { footage: request('b'), reuse: true }, signal())
    expect(calls[1].used).toEqual([])
  })

  it('keeps the spread of one batch apart from another batch', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    await spreads.run('batch-1', { footage: request('a'), reuse: false }, signal())
    await spreads.run('batch-2', { footage: request('b'), reuse: false }, signal())
    expect(calls[1].used).toEqual([])
  })

  it('starts the spread again in a new instance, so it is held in memory only', async () => {
    const first = recordingMatcher()
    await createAssemblySpreads(first.options).run(
      'batch-1',
      { footage: request('a'), reuse: false },
      signal()
    )
    const second = recordingMatcher()
    await createAssemblySpreads(second.options).run(
      'batch-1',
      { footage: request('b'), reuse: false },
      signal()
    )
    expect(second.calls[0].used).toEqual([])
  })

  it('refuses a match that was cancelled before it started, and the next match still runs', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(
      spreads.run('batch-1', { footage: request('a'), reuse: false }, cancelled.signal)
    ).rejects.toBeInstanceOf(UserFacingError)
    await spreads.run('batch-1', { footage: request('b'), reuse: false }, signal())
    expect(calls.map((call) => call.lineId)).toEqual(['b'])
  })

  it('starts a batch with no spread from the seed ranges, and keeps them for later matches', async () => {
    const { calls, options } = recordingMatcher()
    const spreads = createAssemblySpreads(options)
    const seed = [{ mediaId: 'm-old', startMs: 0, endMs: 500 }]
    await spreads.run('batch-1', { footage: request('a'), reuse: false, seed }, signal())
    await spreads.run('batch-1', { footage: request('b'), reuse: false, seed: [] }, signal())
    expect(calls[0].used).toEqual(seed)
    expect(calls[1].used).toEqual([...seed, { mediaId: 'm-a', startMs: 0, endMs: 1000 }])
  })
})
