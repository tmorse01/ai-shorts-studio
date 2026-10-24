// What main reports about a media file after probing it with ffprobe. Shared so the renderer can
// type probe results the same way main produces them.
import { z } from 'zod'

export const probeVideoSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Average frames per second. Null when ffprobe cannot tell.
  fps: z.number().positive().nullable(),
  codec: z.string().min(1),
  // Clockwise display rotation that phones write into the file (0, 90, 180 or 270).
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
})
export type ProbeVideo = z.infer<typeof probeVideoSchema>

export const probeAudioSchema = z.object({
  index: z.number().int().nonnegative(),
  codec: z.string().min(1),
  channels: z.number().int().nonnegative(),
  sampleRate: z.number().int().nonnegative()
})
export type ProbeAudio = z.infer<typeof probeAudioSchema>

export const probeResultSchema = z.object({
  durationSec: z.number().positive(),
  // The first video stream, or null for audio-only files.
  video: probeVideoSchema.nullable(),
  audio: z.array(probeAudioSchema)
})
export type ProbeResult = z.infer<typeof probeResultSchema>
