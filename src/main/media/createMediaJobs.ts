// Wires the media job queue to the real FFmpeg tools. The only file in the media layer that imports
// Electron; everything it calls is tested on its own.
import { app } from 'electron'
import { join } from 'node:path'
import { JobQueue, unavailableExecutors, type JobExecutors } from '../jobs/jobQueue'
import { resolveBinary, type BinaryLocation } from './binaries'
import { probeMedia } from './probeMedia'
import { makeFilmstrip, makeThumb } from './thumbnails'
import { makeProxy } from './proxies'
import { runTool } from './runTool'
import { runExportJob } from '../export/exportJob'
import { makePosterFrame } from './posters'
import { UserFacingError } from '../errors'
import { analysisExecutor, liveStageRunners } from '../analysis/stageRunners'
import { realShotTools } from '../analysis/shotDetection'
import type { AiService } from '../ai/aiService'
import { visionStageRunner } from '../ai/visionStage'
import { transcriptStageRunner } from '../transcription/transcriptStage'
import { realTranscriptTools } from '../transcription/transcriptTools'
import { generateScripts } from '../ai/scriptGenerator'
import { readScriptFootage } from '../ai/scriptFootage'
import { matchFootageRequest } from '../ai/footageMatcher'
import { usedRangesOfPlan, type UsedRange } from '@shared/assembly/footageSpread'

// The footage a batch has already used, and the queue of its matches. Held in memory, so a restart
// starts the spread again; the batch's saved plans are not read back for it.
interface AssemblySpread {
  chain: Promise<unknown>
  used: UsedRange[]
}
const assemblySpreads = new Map<string, AssemblySpread>()

function spreadFor(batchId: string): AssemblySpread {
  let spread = assemblySpreads.get(batchId)
  if (!spread) {
    spread = { chain: Promise.resolve(), used: [] }
    assemblySpreads.set(batchId, spread)
  }
  return spread
}

export function createMediaJobs(ai: AiService): JobQueue {
  const location: BinaryLocation = {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }
  // The binary is looked up when a job runs, not at startup, so a missing tool fails one job with a
  // clear message instead of stopping the app.
  const executors: JobExecutors = {
    ...unavailableExecutors(),
    probe: ({ path }, { signal }) =>
      probeMedia(path, { ffprobe: resolveBinary('ffprobe', location), signal }),
    thumbs: ({ path, outDir, mediaKind }, { signal }) => {
      if (!outDir || !mediaKind) throw new UserFacingError('The thumbnail job lost its details.')
      return makeThumb(mediaKind, path, outDir, {
        ffmpeg: resolveBinary('ffmpeg', location),
        signal
      })
    },
    proxy: ({ path, outPath, durationSec }, { signal, reportProgress }) => {
      if (!outPath || durationSec === undefined) {
        throw new UserFacingError('The proxy job lost its details.')
      }
      return makeProxy(path, outPath, durationSec, {
        ffmpeg: resolveBinary('ffmpeg', location),
        signal,
        onProgress: reportProgress
      })
    },
    poster: ({ path, outPath, sourceTimeSec }, { signal }) => {
      if (!outPath || sourceTimeSec === undefined) {
        throw new UserFacingError('The poster job lost its details.')
      }
      return makePosterFrame(path, outPath, sourceTimeSec, {
        ffmpeg: resolveBinary('ffmpeg', location),
        signal
      })
    },
    // Shots, transcripts and vision run for real. Vision is gated by the key, the cap and the project's
    // cost answer, and is skipped when any of them says no.
    analysis: analysisExecutor(
      liveStageRunners(
        realShotTools({
          ffmpeg: () => resolveBinary('ffmpeg', location),
          ffprobe: () => resolveBinary('ffprobe', location)
        }),
        visionStageRunner(ai),
        transcriptStageRunner(
          realTranscriptTools({
            ffmpeg: () => resolveBinary('ffmpeg', location),
            ffprobe: () => resolveBinary('ffprobe', location),
            modelsRoot: join(app.getPath('userData'), 'models')
          })
        )
      )
    ),
    script: (input) => {
      if (!input.scriptRequest) throw new UserFacingError('The script job lost its request.')
      return generateScripts(ai, readScriptFootage, input.scriptRequest)
    },
    assembly: ({ assembly }, { signal }) => {
      if (!assembly) throw new UserFacingError('The footage job lost its request.')
      const spread = spreadFor(assembly.batchId)
      // Each match waits for the ones before it in the batch, so it sees the cuts they chose.
      const run = spread.chain.then(async () => {
        if (signal.aborted) throw new UserFacingError('Footage matching was cancelled.')
        const result = await matchFootageRequest(
          ai,
          assembly.footage,
          assembly.reuse ? [] : spread.used
        )
        spread.used = [...spread.used, ...usedRangesOfPlan(result.plan)]
        return result
      })
      spread.chain = run.catch(() => undefined)
      return run
    },
    // Renders a short to its MP4. The encode runs in FFmpeg, and the render queue records the result.
    export: ({ export: request }, { signal, reportProgress }) => {
      if (!request) throw new UserFacingError('The export job lost its details.')
      return runExportJob(request, {
        ffmpeg: resolveBinary('ffmpeg', location),
        probe: (path, probeSignal) =>
          probeMedia(path, { ffprobe: resolveBinary('ffprobe', location), signal: probeSignal }),
        run: runTool,
        signal,
        onProgress: reportProgress
      })
    },
    filmstrip: ({ path, outDir, durationSec }, { signal }) => {
      if (!outDir || durationSec === undefined) {
        throw new UserFacingError('The filmstrip job lost its details.')
      }
      return makeFilmstrip(path, outDir, durationSec, {
        ffmpeg: resolveBinary('ffmpeg', location),
        signal
      })
    }
  }
  return new JobQueue(executors)
}
