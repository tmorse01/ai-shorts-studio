import { describe, expect, it, vi, beforeEach } from 'vitest'

const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  }
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

const { rankCandidates, AiError } = await import('../src/main/ai')
const { makeCandidates, parseSceneTimes, sampleEvenly, frameTimes } = await import('../src/main/analysis')
const { safeFileName, chooseOutputPath } = await import('../src/main/jobs')
const { mkdtempSync, writeFileSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')

const baseReq = {
  apiKey: 'sk-ant-test-0000000000000000000000',
  prompt: 'best moments',
  count: 3,
  minSec: 30,
  maxSec: 60,
  durationSec: 600,
  candidates: [{ index: 0, startSec: 0, endSec: 45 }],
  frames: [{ index: 0, timeSec: 20, jpeg: Buffer.from([0xff, 0xd8]) }],
  transcript: null
}

function reply(text: string) {
  create.mockResolvedValueOnce({ content: [{ type: 'text', text }] })
}

beforeEach(() => create.mockReset())

describe('rankCandidates output validation', () => {
  it('clamps segments to the source, drops out-of-range shorts, and dedupes overlaps', async () => {
    reply(
      JSON.stringify({
        shorts: [
          // Valid 40s, starts before 0 and ends past the source: clamped to [0,40]
          { title: 'A', reason: 'ok', segments: [{ startSec: -5, endSec: 40 }] },
          // Heavily overlaps A: must be dropped as a duplicate
          { title: 'A2', reason: 'dup', segments: [{ startSec: 5, endSec: 45 }] },
          // Too short (5s): dropped by duration rules
          { title: 'B', reason: 'short', segments: [{ startSec: 100, endSec: 105 }] },
          // Valid multi-cut 50s
          { title: 'C', reason: 'cuts', segments: [{ startSec: 200, endSec: 220 }, { startSec: 300, endSec: 330 }] }
        ]
      })
    )
    const out = await rankCandidates(baseReq)
    expect(out.map((s) => s.title)).toEqual(['A', 'C'])
    expect(out[0].segments).toEqual([{ startSec: 0, endSec: 40 }])
    expect(out.map((s) => s.rank)).toEqual([1, 2])
  })

  it('reads JSON wrapped in prose and rejects malformed output with a clear kind', async () => {
    reply('Here you go: {"shorts":[{"title":"X","reason":"y","segments":[{"startSec":0,"endSec":40}]}]} thanks')
    const out = await rankCandidates(baseReq)
    expect(out).toHaveLength(1)

    reply('no json at all')
    await expect(rankCandidates(baseReq)).rejects.toMatchObject({ kind: 'malformed' })

    reply('{"shorts": "wrong shape"}')
    await expect(rankCandidates(baseReq)).rejects.toBeInstanceOf(AiError)
  })

  it('maps provider auth and rate-limit errors to user-facing kinds', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 401 }))
    await expect(rankCandidates(baseReq)).rejects.toMatchObject({ kind: 'auth' })
    create.mockRejectedValueOnce(Object.assign(new Error('slow down'), { status: 429 }))
    await expect(rankCandidates(baseReq)).rejects.toMatchObject({ kind: 'rate_limit' })
  })
})

describe('candidate generation', () => {
  it('builds bounded, deduplicated windows that never run past the end', () => {
    const cands = makeCandidates(600, 30, 60, [10.2, 10.4, 300, 999])
    expect(cands.length).toBeLessThanOrEqual(40)
    for (const c of cands) {
      expect(c.endSec).toBeLessThanOrEqual(600)
      expect(c.endSec - c.startSec).toBeLessThanOrEqual(45.01)
    }
    const starts = cands.map((c) => c.startSec)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('caps frame samples and keeps first and last points', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const sampled = sampleEvenly(items, 10)
    expect(sampled).toHaveLength(10)
    expect(sampled[0]).toBe(0)
    expect(sampled[9]).toBe(99)
    const cands = makeCandidates(7200, 30, 60, [])
    expect(frameTimes(cands).length).toBeLessThanOrEqual(40)
  })

  it('parses ffmpeg showinfo scene timestamps', () => {
    const stderr = '[Parsed_showinfo_1] n:0 pts:0 pts_time:0.000\n[Parsed_showinfo_1] n:1 pts_time:12.5 foo\n'
    expect(parseSceneTimes(stderr)).toEqual([0, 12.5])
  })
})

describe('output naming and collision handling', () => {
  it('produces safe filenames without path separators or control characters', () => {
    expect(safeFileName('../../etc/passwd: a*b?')).toBe('....etcpasswd ab')
    expect(safeFileName('   ')).toBe('short')
  })

  it('never overwrites an existing file unless overwrite is confirmed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'names-'))
    writeFileSync(join(dir, 'Clip.mp4'), 'x')
    expect(chooseOutputPath(dir, 'Clip', false)).toBe(join(dir, 'Clip (2).mp4'))
    expect(chooseOutputPath(dir, 'Clip', true)).toBe(join(dir, 'Clip.mp4'))
  })
})
