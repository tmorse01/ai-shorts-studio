import type { AnalysisRequest, ExportRequest, ShortPatch } from './schemas'
import type { Job, Project, SettingsView, Short } from './types'
import type { Segment } from './timeline'

export interface ThumbStatus {
  ready: boolean
  /** Seconds of source time between thumbnails. */
  stepSec: number
  count: number
}

export interface ProjectView extends Project {
  /** True when the recorded source path no longer exists on disk. */
  sourceMissing: boolean
}

/**
 * The only surface the renderer can reach. The preload exposes exactly these functions and
 * nothing that accepts a channel name or raw Node objects.
 */
export interface StudioApi {
  listProjects(): Promise<ProjectView[]>
  createProject(name: string): Promise<ProjectView>
  deleteProject(projectId: string): Promise<void>
  importMedia(projectId: string): Promise<ProjectView | null>
  relinkMedia(projectId: string): Promise<ProjectView | null>
  mediaUrl(projectId: string): string
  ensureThumbnails(projectId: string): Promise<ThumbStatus>
  thumbnailUrl(projectId: string, index: number): string

  listShorts(projectId: string): Promise<Short[]>
  createShort(projectId: string, segments: Segment[], title?: string): Promise<Short>
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
  pickMusicFolder(): Promise<SettingsView>
  listMusic(): Promise<string[]>
  pickOutputDir(): Promise<string | null>
}
