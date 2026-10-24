// Main-process storage for project folders: create, open and save project.json.
// Layout: <folder>/project.json (source of truth), project.json.bak (last good save),
// cache/{proxies,thumbs,analysis} (disposable), exports/.
import { randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SHORT_DEFAULTS,
  projectSchema,
  type Project
} from '@shared/project/schema'
import { loadProjectText, type LoadedProject, type ProjectError } from '@shared/project/loadProject'
import { UserFacingError } from '../errors'
import { offlineMediaIds } from '../media/mediaPaths'

export const PROJECT_FILE = 'project.json'
export const BACKUP_FILE = 'project.json.bak'
export const CACHE_SUBDIRS = ['cache/proxies', 'cache/thumbs', 'cache/analysis'] as const
export const EXPORTS_SUBDIR = 'exports'

export type OpenedProject = {
  folderPath: string
  project: Project
  // Ids of media whose files are not on disk. Checked on every open.
  offlineMediaIds: string[]
  // Set when the file on disk was damaged and the project came from the backup instead.
  warning?: string
}

const RECOVERED_WARNING =
  'project.json could not be read, so the last backup was opened. Your latest edits may be missing.'

// Creates a project folder with the standard layout and a first project.json.
export async function createProject(folderPath: string, name: string): Promise<OpenedProject> {
  const dir = resolve(folderPath)
  if (await pathExists(join(dir, PROJECT_FILE))) {
    throw new UserFacingError('A project already exists in this folder.', dir)
  }
  await mkdir(dir, { recursive: true })
  for (const sub of CACHE_SUBDIRS) await mkdir(join(dir, sub), { recursive: true })
  await mkdir(join(dir, EXPORTS_SUBDIR), { recursive: true })

  const now = new Date().toISOString()
  const project: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    media: [],
    mediaTags: [],
    defaults: {
      ...DEFAULT_SHORT_DEFAULTS,
      targetLength: { ...DEFAULT_SHORT_DEFAULTS.targetLength }
    },
    shorts: [],
    scripts: []
  }
  await saveProject(dir, project)
  return { folderPath: dir, project, offlineMediaIds: [] }
}

// Opens a project folder. A damaged project.json falls back to project.json.bak with a warning.
// A project.json on an older schema is backed up, then rewritten in the current format.
export async function openProject(folderPath: string): Promise<OpenedProject> {
  const dir = resolve(folderPath)
  if (!(await isDirectory(dir))) {
    throw new UserFacingError('That folder does not exist.', dir)
  }

  const primary = await readProjectFile(join(dir, PROJECT_FILE))
  if (primary.kind === 'loaded') {
    if (primary.loaded.migrated) {
      await backupBeforeMigration(dir, primary.loaded.fromVersion)
      await saveProject(dir, primary.loaded.project)
    }
    return describeOpened(dir, primary.loaded.project)
  }
  if (primary.kind === 'unsupported') {
    throw new UserFacingError(primary.error.message, dir)
  }

  const backup = await readProjectFile(join(dir, BACKUP_FILE))
  if (backup.kind === 'loaded') {
    return describeOpened(dir, backup.loaded.project, RECOVERED_WARNING)
  }

  if (primary.kind === 'missing') {
    throw new UserFacingError('This folder is not an AI Shorts Studio project.', dir)
  }
  throw new UserFacingError(
    'The project could not be opened: project.json is damaged and there is no usable backup.',
    primary.error.message
  )
}

async function describeOpened(
  dir: string,
  project: Project,
  warning?: string
): Promise<OpenedProject> {
  return {
    folderPath: dir,
    project,
    offlineMediaIds: await offlineMediaIds(dir, project.media),
    warning
  }
}

// Writes project.json atomically (temp file, flush, rename). Before replacing it, the current file
// is copied to project.json.bak, but only when the current file is a valid project. A damaged file
// never replaces a good backup.
export async function saveProject(folderPath: string, project: Project): Promise<void> {
  const dir = resolve(folderPath)
  const valid = projectSchema.parse(project)
  const target = join(dir, PROJECT_FILE)

  const current = await readProjectFile(target)
  if (current.kind === 'unsupported') {
    throw new UserFacingError(
      'This project was saved by a newer version of AI Shorts Studio, so it was not overwritten.',
      current.error.message
    )
  }
  if (current.kind === 'loaded') {
    await copyFile(target, join(dir, BACKUP_FILE))
  }

  const text = `${JSON.stringify(valid, null, 2)}\n`
  const tmp = join(dir, `${PROJECT_FILE}.${process.pid}.${randomUUID()}.tmp`)
  try {
    const handle = await open(tmp, 'w')
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

type ReadResult =
  | { kind: 'missing' }
  | { kind: 'invalid'; error: ProjectError }
  | { kind: 'unsupported'; error: ProjectError }
  | { kind: 'loaded'; loaded: LoadedProject }

// Reads and validates one project file. Only a missing file counts as "missing"; other read
// failures (for example permissions) are thrown.
async function readProjectFile(path: string): Promise<ReadResult> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return { kind: 'missing' }
    throw error
  }
  const result = loadProjectText(text)
  if (result.ok) return { kind: 'loaded', loaded: result.value }
  if (result.error.code === 'UNSUPPORTED_VERSION')
    return { kind: 'unsupported', error: result.error }
  return { kind: 'invalid', error: result.error }
}

// Keeps the file as it was before the upgrade. The first copy is kept if a backup already exists.
async function backupBeforeMigration(dir: string, fromVersion: number): Promise<void> {
  try {
    await copyFile(
      join(dir, PROJECT_FILE),
      join(dir, `${PROJECT_FILE}.v${fromVersion}.bak`),
      fsConstants.COPYFILE_EXCL
    )
  } catch (error) {
    if (!isErrorCode(error, 'EEXIST')) throw error
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
