import type { AnalysisRequest, ExportRequest, ShortPatch } from './schemas'
import type { Job, MediaView, Project, SettingsView, Short } from './types'
import type { Segment } from './timeline'

export interface ThumbStatus {
  ready: boolean
  /** Seconds of source time between thumbnails. */
  stepSec: number
  count: number
}

/** A project as the renderer sees it: its library entries carry live `missing` flags. */
export interface ProjectView extends Omit<Project, 'media'> {
  media: MediaView[]
}

/**
 * The only surface the renderer can reach. The preload exposes exactly these functions and
 * nothing that accepts a channel name or raw Node objects.
 */
export interface StudioApi {
  listProjects(): Promise<ProjectView[]>
  createProject(name: string): Promise<ProjectView>
  renameProject(projectId: string, name: string): Promise<ProjectView>
  deleteProject(projectId: string): Promise<void>

  /** Add video and audio files to the project's library. Null when the dialog was cancelled. */
  importMedia(projectId: string): Promise<ProjectView | null>
  /** Point a library entry at a new file on disk. Null when the dialog was cancelled. */
  relinkMedia(assetId: string): Promise<ProjectView | null>
  removeMedia(assetId: string): Promise<ProjectView>
  /** Start a playback preview for a video whose codec the renderer cannot decode, when one is needed. */
  prepareMedia(assetId: string): Promise<ProjectView>
  mediaUrl(assetId: string): string
  ensureThumbnails(assetId: string): Promise<ThumbStatus>
  thumbnailUrl(assetId: string, index: number): string
  /** Preview audio for a short: its music bed or its recorded narration. `version` only busts the cache. */
  shortAudioUrl(shortId: string, kind: 'music' | 'narration', version?: string): string

  listShorts(projectId: string): Promise<Short[]>
  createShort(projectId: string, sourceId: string, segments: Segment[], title?: string): Promise<Short>
  updateShort(shortId: string, patch: ShortPatch): Promise<Short>
  deleteShort(shortId: string): Promise<void>
  saveNarration(projectId: string, shortId: string, audio: Uint8Array): Promise<Short>
  clearNarration(projectId: string, shortId: string): Promise<Short>

  startAnalysis(req: AnalysisRequest): Promise<Job>
  startExport(req: ExportRequest): Promise<Job>
  cancelJob(jobId: string): Promise<boolean>
  /** Show a finished short's export in its folder. Takes the short id, never a path. */
  revealExport(shortId: string): Promise<void>
  openExport(shortId: string): Promise<void>
  listJobs(projectId?: string): Promise<Job[]>
  onJobUpdate(callback: (job: Job) => void): () => void

  getSettings(): Promise<SettingsView>
  setApiKey(key: string): Promise<SettingsView>
  clearApiKey(): Promise<SettingsView>
  pickOutputDir(): Promise<string | null>
}
