import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyTranscript, type RawSpeechResult, type Transcript } from '@shared/analysis/transcript'
import { UserFacingError } from '../src/main/errors'
import { SPEECH_SAMPLE_RATE, type SpeechEngine } from '../src/main/transcription/speechEngine'
import { bytesToSamples, audioDecodeArgs } from '../src/main/transcription/decodeAudio'
import {
  readTranscriptCache,
  transcriptCachePath,
  transcriptStageRunner,
  type TranscriptTools
} from '../src/main/transcription/transcriptStage'

const ctx = () => ({ signal: new AbortController().signal, reportProgress: () => undefined })

const MODEL_PATHS = { 'tokens.txt': '/models/tokens.txt' }

// Fake tools: the audio is `samples`, the engine returns `raw`, and every call is recorded.
function fakeTools(
  samples: Float32Array | null,
  raw: RawSpeechResult = { text: '', tokens: [], timestamps: [] }
) {
  const engine = {
    transcribe: vi.fn(async () => raw)
  }
  const tools: TranscriptTools = {
    decodeAudio: vi.fn(async () => samples),
    ensureModel: vi.fn(async () => MODEL_PATHS),
    loadEngine: vi.fn(async () => engine as SpeechEngine)
  }
  return { tools, engine }
}

describe('transcript stage', () => {
  let outDir: string

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'transcript-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes an empty transcript for a clip with no audio track, without loading the model', async () => {
    const { tools } = fakeTools(null)
    const run = transcriptStageRunner(tools)

    await expect(run('/clips/silent.mp4', ctx(), outDir)).resolves.toBe('done')

    expect(tools.ensureModel).not.toHaveBeenCalled()
    expect(tools.loadEngine).not.toHaveBeenCalled()
    const cached = await readTranscriptCache(transcriptCachePath(outDir))
    expect(cached).toEqual(emptyTranscript())
  })

  it('records an empty transcript when the model finds no speech', async () => {
    const { tools, engine } = fakeTools(new Float32Array(1600), {
      text: '',
      tokens: [],
      timestamps: []
    })
    const run = transcriptStageRunner(tools)

    await expect(run('/clips/music.mp4', ctx(), outDir)).resolves.toBe('done')

    expect(engine.transcribe).toHaveBeenCalledOnce()
    expect(await readTranscriptCache(transcriptCachePath(outDir))).toEqual(emptyTranscript())
  })

  it('maps the model output into words and segments, and caches it', async () => {
    const samples = new Float32Array(SPEECH_SAMPLE_RATE)
    const { tools, engine } = fakeTools(samples, {
      text: 'Hi there.',
      tokens: ['▁Hi', '▁there', '.'],
      timestamps: [0, 0.4, 0.8],
      durations: [0.3, 0.3, 0.1]
    })
    const run = transcriptStageRunner(tools)

    await run('/clips/talk.mp4', ctx(), outDir)

    expect(engine.transcribe).toHaveBeenCalledWith(samples, SPEECH_SAMPLE_RATE, expect.anything())
    const cached = JSON.parse(readFileSync(transcriptCachePath(outDir), 'utf8')) as Transcript
    expect(cached.words.map((word) => word.text)).toEqual(['Hi', 'there.'])
    expect(cached.segments).toEqual([{ text: 'Hi there.', startMs: 0, endMs: 900 }])
  })

  it('reuses a valid cached transcript without decoding or transcribing again', async () => {
    const cached = { version: 1, words: [], segments: [] }
    writeFileSync(transcriptCachePath(outDir), JSON.stringify(cached))
    const { tools } = fakeTools(new Float32Array(10))

    await transcriptStageRunner(tools)('/clips/talk.mp4', ctx(), outDir)

    expect(tools.decodeAudio).not.toHaveBeenCalled()
    expect(tools.loadEngine).not.toHaveBeenCalled()
  })

  it('regenerates the transcript when the cache file is missing', async () => {
    const { tools, engine } = fakeTools(new Float32Array(10))

    await transcriptStageRunner(tools)('/clips/talk.mp4', ctx(), outDir)

    expect(engine.transcribe).toHaveBeenCalledOnce()
    expect(await readTranscriptCache(transcriptCachePath(outDir))).toBeDefined()
  })

  it('regenerates the transcript when the cache file does not match the schema', async () => {
    writeFileSync(transcriptCachePath(outDir), '{"version": 9, "words": "nope"}')
    const { tools, engine } = fakeTools(new Float32Array(10))

    await transcriptStageRunner(tools)('/clips/talk.mp4', ctx(), outDir)

    expect(engine.transcribe).toHaveBeenCalledOnce()
  })

  it('loads the engine once and keeps it for later clips', async () => {
    const { tools } = fakeTools(new Float32Array(10))
    const run = transcriptStageRunner(tools)

    await run('/clips/a.mp4', ctx(), outDir)
    await run('/clips/b.mp4', ctx(), outDir)

    expect(tools.loadEngine).toHaveBeenCalledOnce()
  })

  it('tries to load the engine again after a failed load', async () => {
    const { tools } = fakeTools(new Float32Array(10))
    vi.mocked(tools.loadEngine)
      .mockRejectedValueOnce(new Error('missing addon'))
      .mockResolvedValueOnce({ transcribe: async () => ({ text: '', tokens: [], timestamps: [] }) })
    const run = transcriptStageRunner(tools)

    await expect(run('/clips/a.mp4', ctx(), outDir)).rejects.toThrow('missing addon')
    await expect(run('/clips/a.mp4', ctx(), outDir)).resolves.toBe('done')
    expect(tools.loadEngine).toHaveBeenCalledTimes(2)
  })

  it('fails with a plain message when the job has no cache folder', async () => {
    const { tools } = fakeTools(null)

    await expect(transcriptStageRunner(tools)('/clips/a.mp4', ctx())).rejects.toBeInstanceOf(
      UserFacingError
    )
  })
})

describe('decoded audio', () => {
  it('asks FFmpeg for 16 kHz mono float PCM on stdout', () => {
    const args = audioDecodeArgs('/clips/a.mp4')
    expect(args).toEqual(expect.arrayContaining(['-ac', '1', '-ar', '16000', '-f', 'f32le', '-']))
    expect(args).toContain('/clips/a.mp4')
  })

  it('reads float samples from bytes, including bytes that are not 4-byte aligned', () => {
    const source = new Float32Array([0.5, -0.25])
    const bytes = new Uint8Array(source.buffer)
    const padded = new Uint8Array(bytes.length + 1)
    padded.set(bytes, 1)
    expect(Array.from(bytesToSamples(padded.subarray(1)))).toEqual([0.5, -0.25])
  })
})
