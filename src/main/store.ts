import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { ExportItem, ExportPrefs, Job, JobStatus, Project, Short } from '../shared/types'
import type { Segment, Caption } from '../shared/timeline'
import { exportOptionsSchema } from '../shared/schemas'

const probeSchema = z.object({
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  videoCodec: z.string(),
  hasAudio: z.boolean()
})

const stateSchema = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sourcePath: z.string().nullable(),
      probe: probeSchema.nullable(),
      proxyPath: z.string().nullable().default(null),
      createdAt: z.string(),
      updatedAt: z.string()
    })
  ),
  shorts: z.array(z.any()),
  jobs: z.array(z.any()),
  settings: z.object({
    musicFolder: z.string().nullable(),
    lastExport: z
      .object({ outputDir: z.string(), options: exportOptionsSchema })
      .nullable()
      .default(null)
  })
})

interface State {
  version: 1
  projects: Project[]
  shorts: Short[]
  jobs: Job[]
  settings: { musicFolder: string | null; lastExport: ExportPrefs | null }
}

const empty = (): State => ({
  version: 1,
  projects: [],
  shorts: [],
  jobs: [],
  settings: { musicFolder: null, lastExport: null }
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
    this.state = this.load()
    this.recoverInterruptedJobs()
  }

  private load(): State {
    if (!existsSync(this.file)) return empty()
    try {
      const parsed = stateSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')))
      return parsed as State
    } catch {
      // Keep the unreadable file for inspection rather than silently discarding user data.
      const backup = join(dirname(this.file), `state.corrupt-${Date.now()}.json`)
      renameSync(this.file, backup)
      return empty()
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
      sourcePath: null,
      probe: null,
      proxyPath: null,
      createdAt: stamp,
      updatedAt: stamp
    }
    this.state.projects.push(project)
    this.save()
    return project
  }

  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'sourcePath' | 'probe' | 'proxyPath'>>): Project {
    const p = this.getProject(id)
    Object.assign(p, patch, { updatedAt: now() })
    this.save()
    return p
  }

  /** Removes project metadata and its shorts. Never touches the user's source footage. */
  deleteProject(id: string): void {
    this.getProject(id)
    this.state.projects = this.state.projects.filter((p) => p.id !== id)
    this.state.shorts = this.state.shorts.filter((s) => s.projectId !== id)
    this.state.jobs = this.state.jobs.filter((j) => j.projectId !== id)
    this.save()
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
  getMusicFolder(): string | null {
    return this.state.settings.musicFolder
  }

  setMusicFolder(folder: string | null): void {
    this.state.settings.musicFolder = folder
    this.save()
  }

  getLastExport(): ExportPrefs | null {
    return this.state.settings.lastExport
  }

  setLastExport(prefs: ExportPrefs): void {
    this.state.settings.lastExport = prefs
    this.save()
  }
}
