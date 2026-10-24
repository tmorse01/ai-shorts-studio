// The shots stage: finds the cuts in a clip with FFmpeg's scene filter, turns them into shot ranges, and
// samples a few downscaled frames from each shot into the analysis frame cache. The FFmpeg and FFprobe
// calls sit behind ShotTools so the stage is tested with fakes. Shot markers are not shown in the UI.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_SHOT_RULES,
  buildShotRanges,
  frameTimesFor,
  parseSceneCuts,
  shotFrameName,
  type ShotRules
} from '@shared/analysis/shots'
import type { ShotRange, StageData } from '@shared/analysis/analysis'
import { probeMedia } from '../media/probeMedia'
import { runTool } from '../media/runTool'
import { UserFacingError } from '../errors'
import type { JobContext } from '../jobs/jobQueue'
import type { StageRunner } from './stageRunners'

// What the shots stage needs from the outside world. Tests pass fakes.
export interface ShotTools {
  /** Length of the file in seconds. */
  durationSec: (path: string, signal?: AbortSignal) => Promise<number>
  /** Times, in seconds, where scene detection finds a cut. */
  sceneCuts: (path: string, sceneThreshold: number, signal?: AbortSignal) => Promise<number[]>
  /** Writes one downscaled JPEG frame at the given time. */
  extractFrame: (
    path: string,
    timeSec: number,
    outFile: string,
    signal?: AbortSignal
  ) => Promise<void>
}

export function sceneDetectArgs(src: string, sceneThreshold: number): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-i',
    src,
    '-an',
    '-vf',
    `select='gt(scene,${sceneThreshold})',showinfo`,
    '-f',
    'null',
    '-'
  ]
}

export function frameArgs(src: string, timeSec: number, out: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-ss',
    String(timeSec),
    '-i',
    src,
    '-an',
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-2',
    out
  ]
}

/** Finds the shot ranges for one file. */
export async function detectShots(
  path: string,
  tools: ShotTools,
  rules: ShotRules = DEFAULT_SHOT_RULES,
  signal?: AbortSignal
): Promise<ShotRange[]> {
  const duration = await tools.durationSec(path, signal)
  const cuts = await tools.sceneCuts(path, rules.sceneThreshold, signal)
  return buildShotRanges(cuts, duration, rules)
}

/** Samples the frames of every shot into outDir. Returns the file paths written, in shot order. */
export async function sampleShotFrames(
  path: string,
  shots: readonly ShotRange[],
  outDir: string,
  tools: ShotTools,
  signal?: AbortSignal,
  reportProgress: (fraction: number) => void = () => undefined
): Promise<string[]> {
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const [shotIndex, shot] of shots.entries()) {
    const times = frameTimesFor(shot)
    for (const [frameIndex, time] of times.entries()) {
      const out = join(outDir, shotFrameName(shotIndex, frameIndex))
      await tools.extractFrame(path, time, out, signal)
      written.push(out)
    }
    reportProgress((shotIndex + 1) / shots.length)
  }
  return written
}

/** The shots stage runner. Resolves with the shot ranges so the analysis record keeps them. */
export function shotStageRunner(
  tools: ShotTools,
  rules: ShotRules = DEFAULT_SHOT_RULES
): StageRunner {
  return async (path: string, ctx: JobContext, outDir?: string): Promise<StageData> => {
    if (!outDir) throw new UserFacingError('The shot job lost its frame folder.')
    const shots = await detectShots(path, tools, rules, ctx.signal)
    await sampleShotFrames(path, shots, outDir, tools, ctx.signal, ctx.reportProgress)
    return { outcome: 'done', shots }
  }
}

export interface ToolPaths {
  ffmpeg: () => string
  ffprobe: () => string
}

/** The real tools: FFprobe for the length, FFmpeg for scene cuts and frames. */
export function realShotTools(paths: ToolPaths): ShotTools {
  return {
    durationSec: async (path, signal) => {
      const probe = await probeMedia(path, { ffprobe: paths.ffprobe(), signal })
      return probe.durationSec
    },
    sceneCuts: async (path, sceneThreshold, signal) => {
      let log = ''
      await runTool(
        paths.ffmpeg(),
        sceneDetectArgs(path, sceneThreshold),
        signal,
        undefined,
        (chunk) => {
          log += chunk
        }
      )
      // showinfo writes to stderr, so the cut times come from the log, not stdout.
      return parseSceneCuts(log)
    },
    extractFrame: async (path, timeSec, outFile, signal) => {
      await runTool(paths.ffmpeg(), frameArgs(path, timeSec, outFile), signal)
    }
  }
}
