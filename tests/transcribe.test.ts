import { join, resolve } from 'node:path'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { parseWhisperJson, transcriptForWindows, captionsForSegments, transcribeSource, whisperFiles } =
  await import('../src/main/transcribe')

describe('whisper output handling', () => {
  it('parses whisper.cpp JSON offsets into seconds and drops empty segments', () => {
    const raw = JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 3200 }, text: ' This is the first test sentence. ' },
        { offsets: { from: 3200, to: 3300 }, text: '   ' },
        { offsets: { from: 3400, to: 6480 }, text: 'Second line.' }
      ]
    })
    expect(parseWhisperJson(raw)).toEqual([
      { startSec: 0, endSec: 3.2, text: 'This is the first test sentence.' },
      { startSec: 3.4, endSec: 6.48, text: 'Second line.' }
    ])
  })

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

describe('real speech-to-text with the bundled whisper.cpp', () => {
  it('transcribes a real speech clip and caches the result', async () => {
    const files = whisperFiles()
    expect(files, 'whisper binaries must be in resources/whisper (run pnpm fetch:bin)').not.toBeNull()

    const work = mkdtempSync(join(tmpdir(), 'whisper-test-'))
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

    // Second call is served from cache without running whisper again.
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
