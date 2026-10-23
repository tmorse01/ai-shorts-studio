import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ExportItem, ExportPrefs, Job, JobStatus, MediaAsset, Project, Short } from '../shared/types'
import type { Segment, Caption } from '../shared/timeline'
import { migrateState, type PersistedState } from './migrate'

type State = PersistedState

const empty = (): State => ({
  version: 3,
  projects: [],
  shorts: [],
  jobs: [],
  settings: { lastExport: null }
})

const now = (): string => new Date().toISOString()

/**
 * Small atomic JSON store under userData. Every write goes to a temp file and is renamed into
 * place, so a crash mid-write leaves the previous state intact.
 */
export class Store {
  private state: State
  private readonly file: string

  constructor(userDataDir: string) {
    mkdirSync(userDataDir, { recursive: true })
    this.file = join(userDataDir, 'state.json')
    const { state, migrated } = this.load()
    this.state = state
    if (migrated) {
      // Keep the pre-migration file so a bad migration can be undone by hand.
      const backup = join(dirname(this.file), 'state.before-migration.json')
      if (!existsSync(backup)) copyFileSync(this.file, backup)
      this.save()
    }
    this.recoverInterruptedJobs()
  }

  private load(): { state: State; migrated: boolean } {
    if (!existsSync(this.file)) return { state: empty(), migrated: false }
    try {
      return migrateState(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      // Keep the unreadable file for inspection rather than silently discarding user data.
      const backup = join(dirname(this.file), `state.corrupt-${Date.now()}.json`)
      renameSync(this.file, backup)
      return { state: empty(), migrated: false }
    }
  }

  /** Jobs cannot survive a restart, so anything still active is marked interrupted. */
  private recoverInterruptedJobs(): void {
    let changed = false
    for (const job of this.state.jobs) {
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'interrupted'
        job.message = 'The app closed before this job finished. Retry to run it again.'
        job.updatedAt = now()
        changed = true
      }
    }
    if (changed) this.save()
  }

  private save(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  // ---- projects ----
  listProjects(): Project[] {
    return [...this.state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getProject(id: string): Project {
    const p = this.state.projects.find((x) => x.id === id)
    if (!p) throw new Error('Project not found')
    return p
  }

  createProject(name: string): Project {
    const stamp = now()
    const project: Project = {
      id: randomUUID(),
      name,
      media: [],
      createdAt: stamp,
      updatedAt: stamp
    }
    this.state.projects.push(project)
    this.save()
    return project
  }

  updateProject(id: string, patch: Partial<Pick<Project, 'name'>>): Project {
    const p = this.getProject(id)
    Object.assign(p, patch, { updatedAt: now() })
    this.save()
    return p
  }

  /** Removes project metadata, its media entries and its shorts. Never touches the user's footage. */
  deleteProject(id: string): void {
    this.getProject(id)
    this.state.projects = this.state.projects.filter((p) => p.id !== id)
    this.state.shorts = this.state.shorts.filter((s) => s.projectId !== id)
    this.state.jobs = this.state.jobs.filter((j) => j.projectId !== id)
    this.save()
  }

  // ---- media ----
  /** Music files in the project's library that are still on disk, oldest first. */
  musicPaths(projectId: string): string[] {
    return this.getProject(projectId)
      .media.filter((m) => m.kind === 'music' && existsSync(m.path))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => m.path)
  }

  /** Find a media entry by id across all projects, with the project that owns it. */
  findMediaAsset(assetId: string): { project: Project; asset: MediaAsset } {
    for (const project of this.state.projects) {
      const asset = project.media.find((m) => m.id === assetId)
      if (asset) return { project, asset }
    }
    throw new Error('Media not found')
  }

  addMediaAssets(projectId: string, assets: MediaAsset[]): Project {
    const project = this.getProject(projectId)
    project.media.push(...assets)
    project.updatedAt = now()
    this.save()
    return project
  }

  updateMediaAsset(assetId: string, patch: Partial<Pick<MediaAsset, 'name' | 'path' | 'probe' | 'proxyPath'>>): void {
    const { project, asset } = this.findMediaAsset(assetId)
    Object.assign(asset, patch)
    project.updatedAt = now()
    this.save()
  }

  /**
   * Drops a media entry from the library. Refused while clips still point at it, so no clip is left
   * without its footage. The file on disk is never touched.
   */
  removeMediaAsset(assetId: string): Project {
    const { project } = this.findMediaAsset(assetId)
    const used = this.state.shorts.filter((s) => s.sourceId === assetId).length
    if (used > 0) {
      throw new Error(`${used} clip${used === 1 ? ' uses' : 's use'} this video. Delete ${used === 1 ? 'it' : 'them'} first.`)
    }
    project.media = project.media.filter((m) => m.id !== assetId)
    project.updatedAt = now()
    this.save()
    return project
  }

  // ---- shorts ----
  listShorts(projectId: string): Short[] {
    return this.state.shorts
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.createdAt.localeCompare(b.createdAt))
  }

  getShort(id: string): Short {
    const s = this.state.shorts.find((x) => x.id === id)
    if (!s) throw new Error('Short not found')
    return s
  }

  addShorts(shorts: Omit<Short, 'id' | 'createdAt' | 'updatedAt'>[]): Short[] {
    const stamp = now()
    const created = shorts.map((s) => ({ ...s, id: randomUUID(), createdAt: stamp, updatedAt: stamp }))
    this.state.shorts.push(...created)
    this.save()
    return created
  }

  updateShort(
    id: string,
    patch: Partial<{ title: string; segments: Segment[]; captions: Caption[]; settings: Short['settings'] }>
  ): Short {
    const s = this.getShort(id)
    Object.assign(s, patch, { updatedAt: now() })
    this.save()
    return s
  }

  setShortExport(id: string, exportedPath: string | null, narrationPath?: string | null): void {
    const s = this.getShort(id)
    s.exportedPath = exportedPath
    if (narrationPath !== undefined) s.narrationPath = narrationPath
    s.updatedAt = now()
    this.save()
  }

  deleteShort(id: string): void {
    this.getShort(id)
    this.state.shorts = this.state.shorts.filter((s) => s.id !== id)
    this.save()
  }

  // ---- jobs ----
  listJobs(projectId?: string): Job[] {
    return this.state.jobs
      .filter((j) => !projectId || j.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
  }

  createJob(job: Pick<Job, 'projectId' | 'kind'>): Job {
    const stamp = now()
    const full: Job = {
      id: randomUUID(),
      projectId: job.projectId,
      kind: job.kind,
      status: 'running',
      progress: 0,
      message: 'Starting…',
      error: null,
      items: null,
      createdAt: stamp,
      updatedAt: stamp
    }
    this.state.jobs.push(full)
    this.state.jobs = this.state.jobs.slice(-200)
    this.save()
    return full
  }

  updateJob(
    id: string,
    patch: {
      status?: JobStatus
      progress?: number
      message?: string
      error?: string | null
      items?: ExportItem[] | null
    }
  ): void {
    const job = this.state.jobs.find((j) => j.id === id)
    if (!job) return
    Object.assign(job, patch, { updatedAt: now() })
    this.save()
  }

  // ---- settings ----
  getLastExport(): ExportPrefs | null {
    return this.state.settings.lastExport
  }

  setLastExport(prefs: ExportPrefs): void {
    this.state.settings.lastExport = prefs
    this.save()
  }
}
