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
import { isE2eMode } from '../e2e/e2eMode'
import { withFakeSpeech } from '../e2e/fakes'
import { encodeFailsByForce } from '../e2e/forcedEncoderFailure'
import { generateScripts } from '../ai/scriptGenerator'
import { readScriptFootage } from '../ai/scriptFootage'
import { matchFootageRequest } from '../ai/footageMatcher'
import { proposeShorts } from '../ai/shortGenerator'
import { readShortsFootage } from '../ai/shortsFootage'
import { usedRangesOfPlan } from '@shared/assembly/footageSpread'
import { createAssemblySpreads } from './assemblySpread'

// The real transcript tools. In E2E mode only the speech model and engine are faked; FFmpeg stays real.
function speechTools(paths: Parameters<typeof realTranscriptTools>[0]) {
  const tools = realTranscriptTools(paths)
  return isE2eMode() ? withFakeSpeech(tools) : tools
}

export function createMediaJobs(ai: AiService): JobQueue {
  const location: BinaryLocation = {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }
  // The matches of each assembly batch, in order. The spread is held in memory; a batch run after a restart
  // is seeded from its saved plans (see assemblySpread).
  const assemblySpreads = createAssemblySpreads({
    match: (footage, used) => matchFootageRequest(ai, footage, used),
    usedOf: (result) => usedRangesOfPlan(result.plan)
  })
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
          speechTools({
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
      return assemblySpreads.run(
        assembly.batchId,
        { footage: assembly.footage, reuse: assembly.reuse, seed: assembly.priorUsed },
        signal
      )
    },
    shorts: ({ shorts }) => {
      if (!shorts) throw new UserFacingError('The shorts job lost its request.')
      return proposeShorts(ai, readShortsFootage, shorts)
    },
    // Renders a short to its MP4. The encode runs in FFmpeg, and the render queue records the result.
    export: ({ export: request }, { signal, reportProgress }) => {
      if (!request) throw new UserFacingError('The export job lost its details.')
      return runExportJob(request, {
        ffmpeg: resolveBinary('ffmpeg', location),
        probe: (path, probeSignal) =>
          probeMedia(path, { ffprobe: resolveBinary('ffprobe', location), signal: probeSignal }),
        run: (bin, args, runSignal, onStdout) => {
          if (encodeFailsByForce(args)) {
            return Promise.reject(
              new UserFacingError('The hardware encoder failed (forced in E2E).')
            )
          }
          return runTool(bin, args, runSignal, onStdout)
        },
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
