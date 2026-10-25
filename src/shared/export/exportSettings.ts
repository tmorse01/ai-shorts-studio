// Export presets, the shared export settings, the encoder choice and the export estimates (Epic 17,
// #151). Pure: it runs no FFmpeg and reads no disk. Main detects the encoder at startup (see
// src/main/export/encoderDetection.ts) and the renderer shows the estimates from these rules.
import { z } from 'zod'

export const EXPORT_PRESET_IDS = ['youtube', 'tiktok', 'reels', 'generic'] as const
export const exportPresetIdSchema = z.enum(EXPORT_PRESET_IDS)
export type ExportPresetId = z.infer<typeof exportPresetIdSchema>

export const EXPORT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const
export type ExportFps = (typeof EXPORT_FPS_OPTIONS)[number]

export interface ExportPreset {
  id: ExportPresetId
  label: string
  /** The frame rate the preset starts from. The settings card can change it. */
  defaultFps: ExportFps
  videoKbps: number
  audioKbps: number
}

// Vertical 1080 x 1920 (the canvas size) for every platform. Bitrates follow each platform's upload
// guidance, rounded to the nearest sensible value.
export const EXPORT_PRESETS: readonly ExportPreset[] = [
  { id: 'youtube', label: 'YouTube Shorts', defaultFps: 30, videoKbps: 10000, audioKbps: 192 },
  { id: 'tiktok', label: 'TikTok', defaultFps: 30, videoKbps: 8000, audioKbps: 192 },
  { id: 'reels', label: 'Instagram Reels', defaultFps: 30, videoKbps: 6000, audioKbps: 192 },
  { id: 'generic', label: 'Generic vertical', defaultFps: 30, videoKbps: 8000, audioKbps: 192 }
]

export function exportPreset(id: ExportPresetId): ExportPreset {
  const preset = EXPORT_PRESETS.find((item) => item.id === id)
  if (!preset) throw new Error(`Unknown export preset: ${id}`)
  return preset
}

export const exportSettingsSchema = z.object({
  presetId: exportPresetIdSchema,
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  // Placeholders: {project}, {short}, {index}, {preset}. The .mp4 suffix is added after them.
  namingTemplate: z.string().trim().min(1).max(200),
  // Null means the project folder.
  outputFolder: z.string().trim().min(1).nullable(),
  includeCaptions: z.boolean(),
  // Writes the short's captions as an SRT file next to the video (#153).
  includeSrt: z.boolean()
})
export type ExportSettings = z.infer<typeof exportSettingsSchema>

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  presetId: 'youtube',
  fps: 30,
  namingTemplate: '{project} - {short}',
  outputFolder: null,
  includeCaptions: true,
  includeSrt: false
}

export const EXPORT_EXTENSION = '.mp4'

export const NAMING_PLACEHOLDERS = ['project', 'short', 'index', 'preset'] as const

// Characters Windows does not allow in a file name, plus control characters.
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

export interface NamingValues {
  project: string
  short: string
  /** 1-based position of the short in the project. */
  index: number
  preset: string
}

// The file name (without extension) a template gives for one short. Illegal characters are dropped,
// and a name that comes out empty falls back to "export".
export function renderExportName(template: string, values: NamingValues): string {
  const filled = template
    .replace(/\{project\}/g, values.project)
    .replace(/\{short\}/g, values.short)
    .replace(/\{index\}/g, String(values.index))
    .replace(/\{preset\}/g, values.preset)
  const clean = filled.replace(ILLEGAL_FILE_CHARS, '').replace(/\s+/g, ' ').trim()
  return clean.length > 0 ? clean : 'export'
}

// The name as the user sees it in the field: the rendered name with the extension suffix.
export function exportFileName(baseName: string): string {
  return `${baseName}${EXPORT_EXTENSION}`
}

export interface EncoderEstimate {
  bytes: number
  seconds: number
}

// Encode time as a multiple of the clip's length. Hardware encoders are much faster than x264, so
// the estimate is a rough guide, not a promise.
const REALTIME_FACTOR = { hardware: 0.4, software: 1.5 } as const

// Output size and encode time for a short of durationMs, using the preset's bitrates. Size is the
// bitrate times the length; time scales with the encoder.
export function estimateExport(
  durationMs: number,
  preset: ExportPreset,
  hardware: boolean
): EncoderEstimate {
  const seconds = Math.max(0, durationMs) / 1000
  const kbps = preset.videoKbps + preset.audioKbps
  const factor = hardware ? REALTIME_FACTOR.hardware : REALTIME_FACTOR.software
  return {
    bytes: Math.round((kbps * 1000 * seconds) / 8),
    seconds: Math.round(seconds * factor)
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`
}

export function formatEncodeTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, seconds)} s`
  return `${Math.round(seconds / 60)} min`
}

// Encoders in order of preference. The first one the bundled FFmpeg has is used.
export const HARDWARE_ENCODERS = ['h264_nvenc', 'h264_qsv', 'h264_amf'] as const
export const SOFTWARE_ENCODER = 'libx264'

export const encoderInfoSchema = z.object({
  encoder: z.string().min(1),
  hardware: z.boolean(),
  // True when no hardware encoder was found and x264 is used instead.
  fallback: z.boolean(),
  // The bundled FFmpeg version, such as "6.1.1", or null when it could not be read.
  ffmpegVersion: z.string().nullable(),
  // amix with normalize=0 needs FFmpeg 5.0 or later (see renderGraph.ts).
  amixNormalizeSupported: z.boolean()
})
export type EncoderInfo = z.infer<typeof encoderInfoSchema>

// Picks the encoder from the names `ffmpeg -encoders` lists.
export function chooseEncoder(available: readonly string[]): {
  encoder: string
  hardware: boolean
  fallback: boolean
} {
  const names = new Set(available)
  const hardware = HARDWARE_ENCODERS.find((name) => names.has(name))
  if (hardware) return { encoder: hardware, hardware: true, fallback: false }
  return { encoder: SOFTWARE_ENCODER, hardware: false, fallback: true }
}

// The H.264 encoder names in the output of `ffmpeg -encoders`. Each encoder line starts with its
// capability flags, such as " V....D h264_nvenc".
export function parseEncoderNames(output: string): string[] {
  const names: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*[VAS][A-Za-z.]{5}\s+(\S+)/.exec(line)
    if (match?.[1] && /^(h264_|libx264$)/.test(match[1])) names.push(match[1])
  }
  return names
}

export interface FfmpegVersion {
  major: number
  minor: number
  text: string
}

// The version from the first line of `ffmpeg -version`, such as "ffmpeg version 6.1.1-essentials".
// Null for builds that do not report a release number (for example a git build).
export function parseFfmpegVersion(output: string): FfmpegVersion | null {
  const match = /ffmpeg version n?(\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  if (!match?.[1] || !match[2]) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  const text = match[3] ? `${major}.${minor}.${match[3]}` : `${major}.${minor}`
  return { major, minor, text }
}

// amix normalize=0 is available from FFmpeg 5.0. An unknown version counts as not supported.
export function supportsAmixNormalize(version: FfmpegVersion | null): boolean {
  return version !== null && version.major >= 5
}
