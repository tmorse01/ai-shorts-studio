import type { ExportOptions } from './schemas'
import type { Caption, Framing, Ratio, Segment } from './timeline'

export type Provenance = 'ai' | 'heuristic' | 'manual'

export interface ProbeInfo {
  durationSec: number
  width: number
  height: number
  videoCodec: string
  hasAudio: boolean
}

export interface Project {
  id: string
  name: string
  /** Absolute path to the user's original footage. Never uploaded or copied. */
  sourcePath: string | null
  probe: ProbeInfo | null
  /** Cache-only H.264 preview, present when the source codec cannot play in the renderer. */
  proxyPath: string | null
  createdAt: string
  updatedAt: string
}

export interface ShortSettings {
  ratio: Ratio
  framing: Framing
  captionsEnabled: boolean
  captionFontSize: number
  musicEnabled: boolean
  musicVolume: number
  musicDuck: boolean
}

export interface Short {
  id: string
  projectId: string
  title: string
  reason: string
  provenance: Provenance
  rank: number | null
  segments: Segment[]
  captions: Caption[]
  narrationPath: string | null
  settings: ShortSettings
  exportedPath: string | null
  createdAt: string
  updatedAt: string
}

export type JobKind = 'analysis' | 'export' | 'proxy' | 'thumbs'

/** Codecs Chromium plays directly; anything else gets an H.264 preview proxy. */
export const PLAYABLE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1'])
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export type ExportItemStatus = 'queued' | 'preparing' | 'encoding' | 'verifying' | 'done' | 'failed' | 'cancelled'

/** Per-short state inside an export job, so the progress dialog can show each file on its own. */
export interface ExportItem {
  shortId: string
  title: string
  status: ExportItemStatus
  /** 0-100 for this short only. */
  progress: number
  outPath: string | null
}

export interface Job {
  id: string
  projectId: string
  kind: JobKind
  status: JobStatus
  progress: number
  message: string
  error: string | null
  /** Set only on export jobs. */
  items: ExportItem[] | null
  createdAt: string
  updatedAt: string
}

/** Last export choices, pre-filled the next time the export dialog opens. */
export interface ExportPrefs {
  outputDir: string
  options: ExportOptions
}

export interface MediaUrl {
  url: string
  durationSec: number
}

export interface SettingsView {
  hasApiKey: boolean
  keyStorage: 'safeStorage' | 'unavailable'
  musicFolder: string | null
  lastExport: ExportPrefs | null
  whisperAvailable: boolean
  ffmpegAvailable: boolean
}

export interface AnalysisResultView {
  jobId: string
  shorts: Short[]
  notes: string[]
}

export const IPC = {
  projectList: 'project:list',
  projectCreate: 'project:create',
  projectDelete: 'project:delete',
  projectImportMedia: 'project:importMedia',
  projectRelinkMedia: 'project:relinkMedia',
  projectMediaUrl: 'project:mediaUrl',
  shortList: 'short:list',
  shortCreate: 'short:create',
  shortUpdate: 'short:update',
  shortDelete: 'short:delete',
  shortNarrate: 'short:narrate',
  shortClearNarration: 'short:clearNarration',
  analysisStart: 'analysis:start',
  analysisCancel: 'analysis:cancel',
  exportStart: 'export:start',
  exportCancel: 'export:cancel',
  exportReveal: 'export:reveal',
  exportOpen: 'export:open',
  jobList: 'job:list',
  settingsGet: 'settings:get',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',
  settingsSetMusicFolder: 'settings:setMusicFolder',
  musicList: 'music:list',
  dialogPickOutputDir: 'dialog:pickOutputDir',
  thumbsEnsure: 'thumbs:ensure'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
