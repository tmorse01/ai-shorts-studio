import { join, resolve } from 'node:path'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { parseParakeetOutput, transcriptForWindows, captionsForSegments, transcribeSource, parakeetFiles } = await import(
  '../src/main/transcribe'
)

describe('parakeet output handling', () => {
  // Token lines in the exact format parakeet-cli -ps prints; t0/t1 are in 10 ms units.
  const token = (t0: number, t1: number, start: boolean, text: string) =>
    `  [ 0] id= 1 frame=  2 dur_idx= 1 dur_val= 1 p=0.9000 plog=-0.1000 t0=${String(t0).padStart(5)} t1=${String(t1).padStart(5)} word_start=${start} "${text}"`

  it('merges tokens into words and splits segments at pauses', () => {
    const stderr = [
      'Segment 0: [0 -> 3980] "ignored summary line"',
      token(16, 24, true, '▁Go'),
      token(32, 40, true, '▁sho'),
      token(56, 64, false, 'wer'),
      token(328, 336, true, '▁Okay'),
      token(340, 344, false, ','),
      token(9000, 9008, true, '▁Long')
    ].join('\n')
    expect(parseParakeetOutput(stderr)).toEqual([
      { startSec: 0.16, endSec: 0.64, text: 'Go shower' },
      { startSec: 3.28, endSec: 3.44, text: 'Okay,' },
      { startSec: 90, endSec: 90.08, text: 'Long' }
    ])
  })

  it('returns no segments when the CLI printed no tokens', () => {
    expect(parseParakeetOutput('parakeet_model_load: loaded\nnothing to see')).toEqual([])
  })
})

describe('transcript handling', () => {
  it('builds bounded prompt excerpts only from windows that contain speech', () => {
    const segments = [
      { startSec: 1, endSec: 4, text: 'hello there' },
      { startSec: 50, endSec: 55, text: 'later line' }
    ]
    const text = transcriptForWindows(
      segments,
      [
        { index: 0, startSec: 0, endSec: 10 },
        { index: 1, startSec: 20, endSec: 30 },
        { index: 2, startSec: 45, endSec: 60 }
      ],
      8000
    )
    expect(text).toContain('Window #0')
    expect(text).toContain('Window #2')
    expect(text).not.toContain('Window #1')
    expect(transcriptForWindows(segments, [{ index: 0, startSec: 0, endSec: 10 }], 10)).toBe('')
  })

  it('clips captions to kept cuts so no caption shows speech outside the short', () => {
    const segments = [
      { startSec: 2, endSec: 6, text: 'straddles the first cut' },
      { startSec: 30, endSec: 33, text: 'not kept' }
    ]
    const out = captionsForSegments(segments, [{ startSec: 4, endSec: 10 }])
    expect(out).toEqual([{ startSec: 4, endSec: 6, text: 'straddles the first cut' }])
  })
})

describe('real speech-to-text with the bundled Parakeet', () => {
  it('transcribes a real speech clip and caches the result', async () => {
    expect(parakeetFiles(), 'parakeet-cli and the model must be in resources/parakeet (run pnpm fetch:bin)').not.toBeNull()

    const work = mkdtempSync(join(tmpdir(), 'parakeet-test-'))
    const cacheFile = join(work, 'cache', 'transcript.json')
    const segments = await transcribeSource({
      sourcePath: resolve('tests/fixtures/speech.wav'),
      cacheFile,
      scratchDir: join(work, 'scratch'),
      onSpawn: () => undefined
    })
    const text = segments.map((s) => s.text).join(' ').toLowerCase()
    expect(text).toContain('first test sentence')
    expect(text).toContain('second line')
    expect(segments[0].startSec).toBeLessThan(0.5)
    expect(existsSync(cacheFile)).toBe(true)
    expect(JSON.parse(readFileSync(cacheFile, 'utf8')).engine).toBe('parakeet')

    // Second call is served from cache without running Parakeet again.
    const again = await transcribeSource({
      sourcePath: resolve('tests/fixtures/speech.wav'),
      cacheFile,
      scratchDir: join(work, 'scratch2'),
      onSpawn: () => {
        throw new Error('should not spawn when cached')
      }
    })
    expect(again).toEqual(segments)
  }, 300_000)
})
