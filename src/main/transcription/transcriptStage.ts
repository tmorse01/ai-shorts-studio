// The transcript stage: decodes the clip's audio, makes sure the speech model is installed, transcribes
// and writes the result to the media's analysis cache. A clip with no audio or no speech gets an empty
// transcript, which is a finished stage, not a failure. Everything that touches the model, the audio or
// the disk sits behind TranscriptTools, so the stage is tested with fakes.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildTranscript,
  emptyTranscript,
  transcriptSchema,
  type Transcript
} from '@shared/analysis/transcript'
import { UserFacingError } from '../errors'
import type { StageRunner } from '../analysis/stageRunners'
import { SPEECH_SAMPLE_RATE, type SpeechEngine, type SpeechEngineLoader } from './speechEngine'
import type { SpeechModelPaths } from './speechModel'

export const TRANSCRIPT_FILE = 'transcript.json'

export interface TranscriptTools {
  /** Mono float samples at 16 kHz, or null when the file has no audio track. */
  decodeAudio: (path: string, signal?: AbortSignal) => Promise<Float32Array | null>
  /** Makes sure the model is on disk and returns the paths of its files. */
  ensureModel: (
    onProgress: (fraction: number) => void,
    signal?: AbortSignal
  ) => Promise<SpeechModelPaths>
  loadEngine: SpeechEngineLoader
}

/** Where a media item's transcript is cached. outDir is the item's folder under cache/analysis. */
export function transcriptCachePath(outDir: string): string {
  return join(outDir, TRANSCRIPT_FILE)
}

/** The cached transcript, or undefined when there is none or it does not match the schema. */
export async function readTranscriptCache(file: string): Promise<Transcript | undefined> {
  let json: unknown
  try {
    json = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
  const parsed = transcriptSchema.safeParse(json)
  return parsed.success ? parsed.data : undefined
}

// Written to a temp file and renamed, so a crash never leaves a half-written transcript behind.
export async function writeTranscriptCache(file: string, transcript: Transcript): Promise<void> {
  await mkdir(join(file, '..'), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, `${JSON.stringify(transcriptSchema.parse(transcript), null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

/** The transcript stage runner. A cached transcript is reused; a missing one is made again. */
export function transcriptStageRunner(tools: TranscriptTools): StageRunner {
  // The engine is loaded once and kept, since loading the model is slow and uses a lot of memory.
  let engine: Promise<SpeechEngine> | undefined
  const engineFor = (files: SpeechModelPaths): Promise<SpeechEngine> => {
    engine ??= tools.loadEngine(files).catch((error: unknown) => {
      engine = undefined
      throw error
    })
    return engine
  }

  return async (path, ctx, outDir) => {
    if (!outDir) throw new UserFacingError('The transcript job lost its cache folder.')
    const cacheFile = transcriptCachePath(outDir)
    if (await readTranscriptCache(cacheFile)) return 'done'

    const samples = await tools.decodeAudio(path, ctx.signal)
    let transcript: Transcript
    if (!samples || samples.length === 0) {
      transcript = emptyTranscript()
    } else {
      const files = await tools.ensureModel(ctx.reportProgress, ctx.signal)
      const speech = await engineFor(files)
      const raw = await speech.transcribe(samples, SPEECH_SAMPLE_RATE, ctx.signal)
      transcript = buildTranscript(raw)
    }
    await writeTranscriptCache(cacheFile, transcript)
    return 'done'
  }
}
