// Turns ffprobe's JSON into a ProbeResult. Pure, so the parsing rules are tested without ffprobe.
import { z } from 'zod'
import type { ProbeResult, ProbeVideo } from '@shared/media/probe'
import { UserFacingError } from '../errors'

const streamSchema = z.object({
  index: z.number().int().nonnegative(),
  codec_type: z.string(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  avg_frame_rate: z.string().optional(),
  r_frame_rate: z.string().optional(),
  channels: z.number().optional(),
  sample_rate: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional()
})

const ffprobeOutputSchema = z.object({
  streams: z.array(streamSchema),
  format: z.object({ duration: z.string().optional() }).optional()
})

type Stream = z.infer<typeof streamSchema>

export function parseProbeOutput(json: unknown): ProbeResult {
  const parsed = ffprobeOutputSchema.safeParse(json)
  if (!parsed.success) {
    throw new UserFacingError(
      'This file could not be read as media.',
      parsed.error.issues.map((issue) => issue.message).join('; ')
    )
  }

  const { streams, format } = parsed.data
  const videoStream = streams.find((stream) => stream.codec_type === 'video')
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
  if (!videoStream && audioStreams.length === 0) {
    throw new UserFacingError('No readable video or audio stream. Is this a supported file?')
  }

  const durationSec = Number(format?.duration)
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new UserFacingError(
      'Could not read the duration of this file.',
      'ffprobe reported no usable duration. The file may be corrupt.'
    )
  }

  return {
    durationSec,
    video: videoStream ? parseVideo(videoStream) : null,
    audio: audioStreams.map((stream) => ({
      index: stream.index,
      codec: stream.codec_name ?? 'unknown',
      channels: stream.channels ?? 0,
      sampleRate: Number(stream.sample_rate ?? 0)
    }))
  }
}

function parseVideo(stream: Stream): ProbeVideo {
  if (!stream.width || !stream.height) {
    throw new UserFacingError(
      'No readable picture in this file. Is it a supported video format?',
      `Video stream ${stream.index} has no width or height.`
    )
  }
  return {
    width: stream.width,
    height: stream.height,
    fps: frameRate(stream.avg_frame_rate) ?? frameRate(stream.r_frame_rate),
    codec: stream.codec_name ?? 'unknown',
    rotation: rotationOf(stream)
  }
}

// ffprobe writes frame rates as fractions such as "30000/1001". "0/0" means unknown.
function frameRate(fraction: string | undefined): number | null {
  const [numerator, denominator = 1] = (fraction ?? '').split('/').map(Number)
  if (!(numerator > 0) || !(denominator > 0)) return null
  return numerator / denominator
}

// Phones record rotation as a display matrix (degrees, possibly negative) or an old "rotate" tag.
function rotationOf(stream: Stream): ProbeVideo['rotation'] {
  const fromMatrix = stream.side_data_list?.find((data) => data.rotation !== undefined)?.rotation
  const degrees = fromMatrix ?? Number(stream.tags?.rotate ?? 0)
  const quarterTurns = ((Math.round((Number.isFinite(degrees) ? degrees : 0) / 90) % 4) + 4) % 4
  return (quarterTurns * 90) as ProbeVideo['rotation']
}
