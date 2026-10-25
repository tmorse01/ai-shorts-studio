// The export job (Epic 17, #152): builds the FFmpeg command for one short from its render graph and the
// export settings, runs it, and moves the file into place only when FFmpeg finishes. Every tool and file
// operation is passed in, so tests run it with a fake runner and never encode a frame.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fallbackEncoder } from '@shared/export/encoderFallback'
import { exportProgressFromLine } from '@shared/export/renderQueue'
import { buildRenderGraph, type RenderGraph } from '@shared/render/renderGraph'
import { buildOverlaySubtitles } from '@shared/render/overlaySubtitles'
import type { ProbeResult } from '@shared/media/probe'
import type { Timeline } from '@shared/timeline/timeline'
import { UserFacingError } from '../errors'

/** A media file a short's clips read: its id in the project and its absolute path. */
export interface ExportMedia {
  id: string
  path: string
}

/** Everything one export job needs, resolved in main before the job is queued. */
export interface ExportJobInput {
  timeline: Timeline
  media: ExportMedia[]
  /** The FFmpeg video encoder, such as h264_nvenc or libx264. */
  encoder: string
  fps: number
  videoKbps: number
  audioKbps: number
  /** The final file. The job writes a .partial file next to it and renames it on success. */
  outPath: string
}

export interface ExportRunner {
  (
    bin: string,
    args: readonly string[],
    signal?: AbortSignal,
    onStdout?: (chunk: string) => void
  ): Promise<string>
}

export interface ExportDeps {
  ffmpeg: string
  probe: (path: string, signal?: AbortSignal) => Promise<ProbeResult>
  run: ExportRunner
  signal?: AbortSignal
  /** Reports progress as a fraction from 0 to 1. */
  onProgress?: (fraction: number) => void
  commit?: (partial: string, final: string) => Promise<void>
  discard?: (partial: string) => Promise<void>
  makeFolder?: (folder: string) => Promise<void>
  /** Writes the ASS script for the text overlays and captions. */
  writeText?: (path: string, text: string) => Promise<void>
  /** Called when a hardware encoder failed and the job is retried with the named encoder. */
  onEncoderFallback?: (encoder: string) => void
}

/** The FFmpeg arguments that encode the graph into an MP4 at `outPath`. Pure. */
export function exportArgs(
  graph: RenderGraph,
  inputPaths: readonly string[],
  options: Pick<ExportJobInput, 'encoder' | 'videoKbps' | 'audioKbps' | 'outPath'>
): string[] {
  const args = ['-hide_banner', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-y']
  inputPaths.forEach((path, index) => {
    args.push(...(graph.inputOptions[index] ?? []), '-i', path)
  })
  args.push('-filter_complex', graph.filterComplex)
  if (graph.videoLabel) args.push('-map', graph.videoLabel)
  if (graph.audioLabel) args.push('-map', graph.audioLabel)
  else args.push('-an')
  args.push('-c:v', options.encoder, '-b:v', `${options.videoKbps}k`)
  if (graph.audioLabel) args.push('-c:a', 'aac', '-b:a', `${options.audioKbps}k`)
  args.push('-t', (graph.durationMs / 1000).toFixed(3), '-movflags', '+faststart', '-f', 'mp4')
  args.push(options.outPath)
  return args
}

/** Renders one short. Resolves with the final file path. Throws UserFacingError for a short with nothing to render. */
export async function runExportJob(
  input: ExportJobInput,
  deps: ExportDeps
): Promise<{ outPath: string }> {
  const sizes = new Map<string, { width: number; height: number } | null>()
  const sounds = new Map<string, boolean>()
  const paths = new Map(input.media.map((item) => [item.id, item.path]))
  for (const item of input.media) {
    const probed = await deps.probe(item.path, deps.signal)
    sizes.set(
      item.id,
      probed.video ? { width: probed.video.width, height: probed.video.height } : null
    )
    sounds.set(item.id, probed.audio.length > 0)
  }
  const sizeOf = (id: string) => sizes.get(id) ?? null
  // Text overlays and captions are burnt in from an ASS script next to the output, removed after the job.
  const subtitles = buildOverlaySubtitles(input.timeline, { fps: input.fps, sizeOf })
  const subtitlesPath = subtitles ? `${input.outPath}.subs.ass` : undefined
  const graph = buildRenderGraph(input.timeline, {
    fps: input.fps,
    sizeOf,
    hasAudio: (id) => sounds.get(id) ?? false,
    subtitlesPath
  })
  if (!graph.videoLabel) {
    throw new UserFacingError('This short has nothing to export.')
  }
  const inputPaths = graph.inputs.map((id) => {
    const path = paths.get(id)
    if (!path) throw new UserFacingError('A clip uses footage that is no longer in the project.')
    return path
  })

  const partial = `${input.outPath}.partial`
  const makeFolder =
    deps.makeFolder ?? ((folder) => mkdir(folder, { recursive: true }).then(() => undefined))
  const commit = deps.commit ?? ((from, to) => rename(from, to))
  const discard = deps.discard ?? ((file) => rm(file, { force: true }))
  const writeText = deps.writeText ?? ((file, text) => writeFile(file, text, 'utf8'))
  await makeFolder(dirname(input.outPath))
  try {
    if (subtitles && subtitlesPath) await writeText(subtitlesPath, subtitles)
    // A hardware encoder that fails is retried once with x264 (see encoderFallback.ts). Anything else ends the job.
    let encoder = input.encoder
    for (;;) {
      let pending = ''
      try {
        await deps.run(
          deps.ffmpeg,
          exportArgs(graph, inputPaths, { ...input, encoder, outPath: partial }),
          deps.signal,
          (chunk) => {
            // Progress lines can split across chunks, so only whole lines are read.
            const lines = (pending + chunk).split('\n')
            pending = lines.pop() ?? ''
            for (const line of lines) {
              const fraction = exportProgressFromLine(line, graph.durationMs)
              if (fraction !== undefined) deps.onProgress?.(fraction)
            }
          }
        )
        break
      } catch (error) {
        const next = fallbackEncoder(encoder, {
          cancelled: deps.signal?.aborted === true,
          details: error instanceof UserFacingError ? error.details : undefined
        })
        if (!next) throw error
        encoder = next
        deps.onEncoderFallback?.(next)
      }
    }
    await commit(partial, input.outPath)
  } catch (error) {
    await discard(partial)
    throw error
  } finally {
    if (subtitlesPath) await discard(subtitlesPath)
  }
  return { outPath: input.outPath }
}
