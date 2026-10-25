import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analysisRecordSchema, newAnalysisRecord, withShots } from '@shared/analysis/analysis'
import {
  DEFAULT_SHOT_RULES,
  buildShotRanges,
  frameCountFor,
  frameTimesFor,
  parseSceneCuts,
  shotFrameName
} from '@shared/analysis/shots'
import {
  detectShots,
  frameArgs,
  sampleShotFrames,
  sceneDetectArgs,
  shotStageRunner,
  type ShotTools
} from '../src/main/analysis/shotDetection'
import { analysisExecutor, liveStageRunners } from '../src/main/analysis/stageRunners'
import { analysisFramesDir } from '../src/main/analysis/frameCache'
import { UserFacingError } from '../src/main/errors'

const ctx = () => ({ signal: new AbortController().signal, reportProgress: () => undefined })

// showinfo output as FFmpeg prints it on stderr. Other lines in the log must be ignored.
const SHOWINFO_LOG = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':
[Parsed_showinfo_1 @ 000001] n:   0 pts:      0 pts_time:0       duration:   1001 fmt:yuv420p
[Parsed_showinfo_1 @ 000001] n:  75 pts:  75075 pts_time:3.003   duration:   1001 fmt:yuv420p
[Parsed_showinfo_1 @ 000001] n: 240 pts:  240240 pts_time:9.61   duration:   1001 fmt:yuv420p
frame=  300 fps=0.0 q=-0.0 Lsize=N/A time=00:00:12.00
`

// Fake tools: the file is `durationSec` long, has the given cuts, and frames are only recorded.
function fakeTools(durationSec: number, cuts: number[]) {
  const frames: { time: number; out: string }[] = []
  const tools: ShotTools = {
    durationSec: async () => durationSec,
    sceneCuts: async () => cuts,
    extractFrame: async (_path, time, out) => {
      frames.push({ time, out })
    }
  }
  return { tools, frames }
}

describe('scene cut parsing', () => {
  it('reads the cut times from showinfo lines and ignores the rest', () => {
    expect(parseSceneCuts(SHOWINFO_LOG)).toEqual([0, 3.003, 9.61])
  })

  it('returns nothing for a log without cuts', () => {
    expect(parseSceneCuts('frame= 10 fps=0.0\n')).toEqual([])
  })
})

describe('shot ranges', () => {
  it('splits the footage at each cut and covers the whole length', () => {
    expect(buildShotRanges([4, 8], 12)).toEqual([
      { startSec: 0, endSec: 4 },
      { startSec: 4, endSec: 8 },
      { startSec: 8, endSec: 12 }
    ])
  })

  it('drops a cut that would make a shot shorter than the minimum', () => {
    // The cut at 2.5 is only 0.5s after the cut at 2, below the minimum, so it is dropped.
    expect(buildShotRanges([2, 2.5, 6], 10)).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 2, endSec: 6 },
      { startSec: 6, endSec: 10 }
    ])
  })

  it('merges a tail shorter than the minimum into the shot before it', () => {
    expect(buildShotRanges([5, 9.8], 10)).toEqual([
      { startSec: 0, endSec: 5 },
      { startSec: 5, endSec: 10 }
    ])
  })

  it('splits a long take with no cuts so each piece stays under the maximum', () => {
    const shots = buildShotRanges([], 25)
    expect(shots).toHaveLength(3)
    expect(shots[0].startSec).toBe(0)
    expect(shots[shots.length - 1].endSec).toBe(25)
    for (const shot of shots) {
      expect(shot.endSec - shot.startSec).toBeLessThanOrEqual(DEFAULT_SHOT_RULES.maxShotSec)
    }
  })

  it('ignores cuts outside the file and duplicate cuts', () => {
    expect(buildShotRanges([0, 4, 4, 15], 8)).toEqual([
      { startSec: 0, endSec: 4 },
      { startSec: 4, endSec: 8 }
    ])
  })

  it('returns no shots for a file with no length', () => {
    expect(buildShotRanges([1], 0)).toEqual([])
  })
})

describe('frame sampling plan', () => {
  it('takes two frames from a short shot and three from a longer one', () => {
    expect(frameCountFor({ startSec: 0, endSec: 2 })).toBe(2)
    expect(frameCountFor({ startSec: 0, endSec: 6 })).toBe(3)
  })

  it('spaces the frames inside the shot, never on its first or last instant', () => {
    expect(frameTimesFor({ startSec: 0, endSec: 8 })).toEqual([2, 4, 6])
    expect(frameTimesFor({ startSec: 10, endSec: 12 })).toEqual([10.667, 11.333])
  })

  it('names frames so they sort by shot and then by frame', () => {
    expect(shotFrameName(3, 1)).toBe('shot-0003-1.jpg')
  })
})

describe('FFmpeg arguments', () => {
  it('runs scene detection with the threshold and no audio', () => {
    const args = sceneDetectArgs('clip.mp4', 0.3)
    expect(args).toContain("select='gt(scene,0.3)',showinfo")
    expect(args).toContain('-an')
    expect(args.indexOf('clip.mp4')).toBeGreaterThan(-1)
  })

  it('grabs one downscaled frame at the given time', () => {
    const args = frameArgs('clip.mp4', 4.5, 'out.jpg')
    expect(args[args.indexOf('-ss') + 1]).toBe('4.5')
    expect(args).toContain('scale=320:-2')
    expect(args[args.length - 1]).toBe('out.jpg')
  })
})

describe('shot detection stage', () => {
  it('finds shots from the cuts and the length of the file', async () => {
    const { tools } = fakeTools(12, [4, 8])
    await expect(detectShots('clip.mp4', tools)).resolves.toHaveLength(3)
  })

  it('samples frames for every shot into the output folder, in shot order', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'shot-frames-'))
    const { tools, frames } = fakeTools(12, [4])
    const shots = await detectShots('clip.mp4', tools)
    const written = await sampleShotFrames('clip.mp4', shots, outDir, tools)

    // Shots 0-4 and 4-12 are both four seconds or longer, so each gets three frames.
    expect(written).toHaveLength(6)
    expect(frames.map((frame) => frame.time)).toEqual([1, 2, 3, 6, 8, 10])
    expect(written[0]).toBe(join(outDir, 'shot-0000-0.jpg'))
    expect(written[5]).toBe(join(outDir, 'shot-0001-2.jpg'))
  })

  it('skips the shots stage for an audio-only file instead of failing', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'shot-runner-'))
    const { tools, frames } = fakeTools(12, [4, 8])
    let askedForCuts = false
    const audioOnly: ShotTools = {
      ...tools,
      hasVideo: async () => false,
      sceneCuts: async () => {
        askedForCuts = true
        return []
      }
    }
    const result = await shotStageRunner(audioOnly)('narration.wav', ctx(), outDir)
    expect(result).toEqual({ outcome: 'skipped' })
    expect(askedForCuts).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('returns the shots and reports progress through the job context', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'shot-runner-'))
    const { tools } = fakeTools(12, [4, 8])
    const progress: number[] = []
    const run = shotStageRunner(tools)
    const result = await run(
      'clip.mp4',
      { ...ctx(), reportProgress: (f) => progress.push(f) },
      outDir
    )

    expect(result).toEqual({
      outcome: 'done',
      shots: [
        { startSec: 0, endSec: 4 },
        { startSec: 4, endSec: 8 },
        { startSec: 8, endSec: 12 }
      ]
    })
    expect(progress).toEqual([1 / 3, 2 / 3, 1])
  })

  it('fails with a plain message when the job has no frame folder', async () => {
    const { tools } = fakeTools(12, [])
    const run = shotStageRunner(tools)
    await expect(run('clip.mp4', ctx())).rejects.toBeInstanceOf(UserFacingError)
  })

  it('runs the shots stage through the stage runners and leaves the other stages skipped', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'shot-live-'))
    const { tools } = fakeTools(6, [])
    const execute = analysisExecutor(liveStageRunners(tools))

    const shots = await execute({ path: 'clip.mp4', stage: 'shots', outDir }, ctx())
    expect(shots).toEqual({ outcome: 'done', shots: [{ startSec: 0, endSec: 6 }] })
    await expect(execute({ path: 'clip.mp4', stage: 'vision' }, ctx())).resolves.toBe('skipped')
    await expect(execute({ path: 'clip.mp4', stage: 'transcript' }, ctx())).resolves.toBe('skipped')
  })
})

describe('shots on the analysis record', () => {
  it('keeps shot ranges on a record and reads them back', () => {
    const record = withShots(newAnalysisRecord('clip-1'), [{ startSec: 0, endSec: 4 }])
    expect(analysisRecordSchema.parse(record).shots).toEqual([{ startSec: 0, endSec: 4 }])
  })

  it('accepts a record from before shots existed', () => {
    expect(analysisRecordSchema.safeParse(newAnalysisRecord('clip-1')).success).toBe(true)
  })

  it('puts frames for a media item in the analysis frame cache', () => {
    expect(analysisFramesDir('G:/Projects/demo', 'clip-1')).toMatch(
      /cache[\\/]analysis[\\/]frames[\\/]clip-1$/
    )
  })
})
