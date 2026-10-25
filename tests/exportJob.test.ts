import { describe, expect, it } from 'vitest'
import { exportArgs, runExportJob, type ExportJobInput } from '../src/main/export/exportJob'
import { exportProgressFromLine, renderEtaSec } from '@shared/export/renderQueue'
import { buildRenderGraph, type RenderGraph } from '@shared/render/renderGraph'
import type { Timeline } from '@shared/timeline/timeline'
import { UserFacingError } from '../src/main/errors'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const timeline: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [
        {
          id: 'c1',
          mediaId: 'cam-a',
          startMs: 0,
          durationMs: 4000,
          sourceInMs: 0,
          transform: IDENTITY
        }
      ]
    }
  ]
}

const input: ExportJobInput = {
  timeline,
  media: [{ id: 'cam-a', path: 'C:/footage/cam-a.mp4' }],
  encoder: 'libx264',
  fps: 30,
  videoKbps: 10000,
  audioKbps: 192,
  outPath: 'C:/out/Demo - Hook.mp4'
}

// Records what the job asked for. Nothing is encoded: the runner is a fake.
function fakeDeps(
  overrides: Partial<Parameters<typeof runExportJob>[1]> = {},
  progressChunks: string[] = []
) {
  const calls: { bin: string; args: readonly string[] }[] = []
  const committed: [string, string][] = []
  const discarded: string[] = []
  const progress: number[] = []
  const deps: Parameters<typeof runExportJob>[1] = {
    ffmpeg: 'ffmpeg.exe',
    probe: async () => ({
      durationSec: 4,
      video: { width: 1920, height: 1080, fps: 30, codec: 'h264', rotation: 0 },
      audio: [{ index: 1, codec: 'aac', channels: 2, sampleRate: 48000 }]
    }),
    run: async (bin, args, _signal, onStdout) => {
      calls.push({ bin, args })
      for (const chunk of progressChunks) onStdout?.(chunk)
      return ''
    },
    makeFolder: async () => undefined,
    commit: async (from, to) => {
      committed.push([from, to])
    },
    discard: async (file) => {
      discarded.push(file)
    },
    onProgress: (fraction) => progress.push(fraction),
    ...overrides
  }
  return { deps, calls, committed, discarded, progress }
}

describe('exportArgs', () => {
  const graph: RenderGraph = {
    filterComplex: '[0:v]null[vout]',
    inputs: ['cam-a'],
    inputOptions: [[]],
    videoLabel: '[vout]',
    audioLabel: '[aout]',
    durationMs: 4000
  }

  it('reads each input, maps the labels and encodes to the output file', () => {
    const args = exportArgs(graph, ['C:/footage/cam-a.mp4'], {
      encoder: 'h264_nvenc',
      videoKbps: 8000,
      audioKbps: 192,
      outPath: 'out.mp4.partial'
    })
    expect(args).toContain('-i')
    expect(args[args.indexOf('-i') + 1]).toBe('C:/footage/cam-a.mp4')
    expect(args[args.indexOf('-filter_complex') + 1]).toBe('[0:v]null[vout]')
    expect(args).toEqual(expect.arrayContaining(['-map', '[vout]', '-map', '[aout]']))
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'h264_nvenc', '-b:v', '8000k']))
    expect(args).toEqual(expect.arrayContaining(['-c:a', 'aac', '-b:a', '192k']))
    expect(args).toEqual(expect.arrayContaining(['-f', 'mp4', '-progress', 'pipe:1']))
    expect(args[args.length - 1]).toBe('out.mp4.partial')
  })

  it('drops the sound when the graph has none', () => {
    const silent: RenderGraph = { ...graph, audioLabel: null }
    const args = exportArgs(silent, [], {
      encoder: 'libx264',
      videoKbps: 1000,
      audioKbps: 192,
      outPath: 'x.mp4'
    })
    expect(args).toContain('-an')
    expect(args).not.toContain('-c:a')
  })
})

describe('exportProgressFromLine and renderEtaSec', () => {
  it('reads the encoded position against the length', () => {
    expect(exportProgressFromLine('out_time_us=2000000', 4000)).toBe(0.5)
    expect(exportProgressFromLine('out_time_ms=1000000', 4000)).toBe(0.25)
    expect(exportProgressFromLine('out_time_us=9000000', 4000)).toBe(1)
  })

  it('ignores lines without a position', () => {
    expect(exportProgressFromLine('out_time_us=N/A', 4000)).toBeUndefined()
    expect(exportProgressFromLine('progress=end', 4000)).toBeUndefined()
    expect(exportProgressFromLine('out_time_us=100', 0)).toBeUndefined()
  })

  it('estimates time left from the share done', () => {
    expect(renderEtaSec(0.25, 10000)).toBe(30)
    expect(renderEtaSec(0, 10000)).toBeNull()
    expect(renderEtaSec(1, 10000)).toBeNull()
  })
})

describe('runExportJob', () => {
  it('renders to a partial file, reports progress, then moves it into place', async () => {
    const { deps, calls, committed, discarded, progress } = fakeDeps(
      {},
      // A progress line split across two chunks is read once it is whole.
      ['out_time_us=1000', '000\nout_time_us=2000000\n', 'progress=continue\n']
    )
    const result = await runExportJob(input, deps)

    expect(result).toEqual({ outPath: 'C:/out/Demo - Hook.mp4' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.bin).toBe('ffmpeg.exe')
    expect(calls[0]?.args[calls[0].args.length - 1]).toBe('C:/out/Demo - Hook.mp4.partial')
    expect(committed).toEqual([['C:/out/Demo - Hook.mp4.partial', 'C:/out/Demo - Hook.mp4']])
    expect(discarded).toEqual([])
    expect(progress).toEqual([0.25, 0.5])
  })

  it('throws away the partial file when the encode fails and does not move it', async () => {
    const { deps, committed, discarded } = fakeDeps({
      run: async () => {
        throw new UserFacingError('Export failed.', 'ffmpeg exited with code 1')
      }
    })
    await expect(runExportJob(input, deps)).rejects.toBeInstanceOf(UserFacingError)
    expect(committed).toEqual([])
    expect(discarded).toEqual(['C:/out/Demo - Hook.mp4.partial'])
  })

  it('refuses a short with nothing to render, without starting FFmpeg', async () => {
    const { deps, calls } = fakeDeps()
    const empty: ExportJobInput = { ...input, timeline: { tracks: [] } }
    await expect(runExportJob(empty, deps)).rejects.toThrow('nothing to export')
    expect(calls).toEqual([])
  })

  it('refuses a clip whose footage is not in the job', async () => {
    const { deps, calls } = fakeDeps()
    await expect(runExportJob({ ...input, media: [] }, deps)).rejects.toThrow(
      'no longer in the project'
    )
    expect(calls).toEqual([])
  })

  it('builds the same graph the preview uses for the clip', () => {
    // The job's sizes and sound come from probing. A clip with no sound and a video frame builds a graph
    // with no audio label, so the arguments carry -an.
    const graph = buildRenderGraph(timeline, {
      fps: 30,
      sizeOf: () => ({ width: 1920, height: 1080 }),
      hasAudio: () => false
    })
    expect(graph.videoLabel).toBe('[vout]')
    expect(graph.audioLabel).toBeNull()
  })
})
