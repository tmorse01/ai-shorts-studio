import type { ExportOptions } from './schemas'
import type { Caption, Framing, Ratio, Segment } from './timeline'
import type { StageStatus } from './pipeline-graph'

export type Provenance = 'ai' | 'heuristic' | 'manual'

export interface ProbeInfo {
  durationSec: number
  width: number
  height: number
  videoCodec: string
  hasAudio: boolean
}

/** Which library filter a kind belongs to. Audio is only `music`; everything else is video. */
export type MediaType = 'video' | 'audio'

/**
 * One file in a project's media library. `source` is footage the user imported; `export` is a clip
 * rendered by this app and added back to the library; `music` is an audio file used for music beds.
 */
export interface MediaAsset {
  id: string
  name: string
  kind: 'source' | 'export' | 'music'
  /** Absolute path to the file. Never uploaded or copied. */
  path: string
  probe: ProbeInfo
  /** Cache-only H.264 preview, present when the source codec cannot play in the renderer. */
  proxyPath: string | null
  createdAt: string
}

/** A library entry as the renderer sees it. `missing` is computed on each read, never stored. */
export interface MediaView extends MediaAsset {
  missing: boolean
}

export interface Project {
  id: string
  name: string
  media: MediaAsset[]
  createdAt: string
  updatedAt: string
}

/** A piece of a music-library track placed on the short's timeline. */
export interface MusicClip {
  id: string
  /** The music library asset this clip plays from. */
  assetId: string
  /** Where the clip starts on the short's timeline, in seconds. */
  startSec: number
  /** Where in the track the clip starts, in seconds. */
  trackStartSec: number
  lengthSec: number
}

export interface ShortSettings {
  ratio: Ratio
  framing: Framing
  captionsEnabled: boolean
  captionFontSize: number
  /** Pieces of music-library tracks placed on the short's timeline. Empty for no music. */
  musicClips: MusicClip[]
  musicVolume: number
  musicDuck: boolean
}

export interface Short {
  id: string
  projectId: string
  /** The media asset this clip was cut from. Null only for clips from a migrated project with no source. */
  sourceId: string | null
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
  /** Set only on analysis jobs: the state of each node in the clip pipeline graph. */
  stages: StageStatus[] | null
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
  lastExport: ExportPrefs | null
  speechAvailable: boolean
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
  projectUpdate: 'project:update',
  projectDelete: 'project:delete',
  mediaImport: 'media:import',
  mediaRelink: 'media:relink',
  mediaRemove: 'media:remove',
  mediaPrepare: 'media:prepare',
  mediaPosters: 'media:posters',
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
  dialogPickOutputDir: 'dialog:pickOutputDir',
  thumbsEnsure: 'thumbs:ensure'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
