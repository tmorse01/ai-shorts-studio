import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import {
  BACKUP_FILE,
  PROJECT_FILE,
  createProject,
  openProject,
  saveProject
} from '../src/main/project/projectStorage'
import { UserFacingError } from '../src/main/errors'
import { CURRENT_SCHEMA_VERSION, type Project } from '@shared/project/schema'
import type { IpcResult } from '@shared/ipc'

let root: string
let folder: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ass-project-'))
  folder = join(root, 'My Shoot')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

// A project as the first cut wrote it (schemaVersion 1, media paths without pathKind).
function v1Project() {
  return {
    schemaVersion: 1,
    id: 'proj_1',
    name: 'Harbour interview',
    createdAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:30:00.000Z',
    media: [
      { id: 'media_1', path: 'footage/a.mp4', fileName: 'a.mp4', sizeBytes: 10, kind: 'video' }
    ],
    shorts: [],
    scripts: []
  }
}

describe('createProject', () => {
  it('makes the folder layout and a valid project.json', async () => {
    const created = await createProject(folder, 'Harbour interview')

    expect(created.project.name).toBe('Harbour interview')
    expect(created.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(created.warning).toBeUndefined()
    expect((await readdir(join(folder, 'cache'))).sort()).toEqual(['analysis', 'proxies', 'thumbs'])
    expect(await readdir(join(folder, 'exports'))).toEqual([])
    expect(await readJson(join(folder, PROJECT_FILE))).toEqual(created.project)
  })

  it('refuses to create over an existing project', async () => {
    await createProject(folder, 'First')
    await expect(createProject(folder, 'Second')).rejects.toBeInstanceOf(UserFacingError)
    const onDisk = (await readJson(join(folder, PROJECT_FILE))) as Project
    expect(onDisk.name).toBe('First')
  })
})

describe('openProject', () => {
  it('opens what createProject wrote', async () => {
    const created = await createProject(folder, 'Harbour')
    const opened = await openProject(folder)
    expect(opened.project).toEqual(created.project)
    expect(opened.warning).toBeUndefined()
  })

  it('reports a missing folder in plain language', async () => {
    const error = await openProject(join(root, 'nope')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as UserFacingError).message).toBe('That folder does not exist.')
  })

  it('rejects a folder that holds no project', async () => {
    await mkdir(folder, { recursive: true })
    const error = await openProject(folder).catch((e: unknown) => e)
    expect((error as UserFacingError).message).toBe(
      'This folder is not an AI Shorts Studio project.'
    )
  })

  it('opens the backup with a warning when project.json is corrupt', async () => {
    const created = await createProject(folder, 'Harbour')
    await saveProject(folder, { ...created.project, name: 'Harbour v2' })
    await writeFile(join(folder, PROJECT_FILE), '{ not json', 'utf8')

    const opened = await openProject(folder)
    expect(opened.project.name).toBe('Harbour')
    expect(opened.warning).toContain('last backup was opened')
    // The damaged file is left alone until the next save replaces it.
    expect(await readFile(join(folder, PROJECT_FILE), 'utf8')).toBe('{ not json')
  })

  it('opens the backup with a warning when project.json fails the schema', async () => {
    const created = await createProject(folder, 'Harbour')
    await saveProject(folder, { ...created.project, name: 'Harbour v2' })
    const broken = { ...created.project, name: '' }
    await writeFile(join(folder, PROJECT_FILE), JSON.stringify(broken), 'utf8')

    const opened = await openProject(folder)
    expect(opened.project.name).toBe('Harbour')
    expect(opened.warning).toBeDefined()
  })

  it('fails with a readable error when project.json is corrupt and there is no backup', async () => {
    await createProject(folder, 'Harbour')
    await rm(join(folder, BACKUP_FILE), { force: true })
    await writeFile(join(folder, PROJECT_FILE), '{ not json', 'utf8')

    const error = await openProject(folder).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as UserFacingError).details).toContain('not valid JSON')
  })

  it('backs up a v1 file before writing the upgraded version', async () => {
    await mkdir(folder, { recursive: true })
    const original = JSON.stringify(v1Project(), null, 2)
    await writeFile(join(folder, PROJECT_FILE), original, 'utf8')

    const opened = await openProject(folder)
    expect(opened.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(opened.project.media[0]?.pathKind).toBe('relative')

    expect(await readFile(join(folder, `${PROJECT_FILE}.v1.bak`), 'utf8')).toBe(original)
    const onDisk = (await readJson(join(folder, PROJECT_FILE))) as { schemaVersion: number }
    expect(onDisk.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('saveProject', () => {
  it('rolls the previous good file into project.json.bak', async () => {
    const created = await createProject(folder, 'Harbour')
    await saveProject(folder, { ...created.project, name: 'Harbour v2' })

    const backup = (await readJson(join(folder, BACKUP_FILE))) as Project
    const current = (await readJson(join(folder, PROJECT_FILE))) as Project
    expect(backup.name).toBe('Harbour')
    expect(current.name).toBe('Harbour v2')
  })

  it('leaves no temp files behind', async () => {
    const created = await createProject(folder, 'Harbour')
    await saveProject(folder, { ...created.project, name: 'Harbour v2' })
    const leftovers = (await readdir(folder)).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('does not replace a good backup with a damaged project.json', async () => {
    const created = await createProject(folder, 'Harbour')
    await saveProject(folder, { ...created.project, name: 'Harbour v2' })
    await writeFile(join(folder, PROJECT_FILE), '{ broken', 'utf8')

    await saveProject(folder, { ...created.project, name: 'Harbour v3' })
    const backup = (await readJson(join(folder, BACKUP_FILE))) as Project
    expect(backup.name).toBe('Harbour')
  })

  it('will not overwrite a project saved by a newer app version', async () => {
    await mkdir(folder, { recursive: true })
    const newer = { ...v1Project(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    await writeFile(join(folder, PROJECT_FILE), JSON.stringify(newer), 'utf8')

    const created = await createProject(join(root, 'other'), 'Other')
    const error = await saveProject(folder, created.project).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UserFacingError)
    expect(await readJson(join(folder, PROJECT_FILE))).toEqual(newer)
  })
})

describe('project IPC channels', () => {
  function makeBridge() {
    const ipcHandlers = createIpcHandlers({ layoutFile: join(folder, 'ui-layout.json') })
    return createBridge((channel, input) => routeIpc(ipcHandlers, channel, input))
  }

  it('project:create then project:open round-trip through the bridge', async () => {
    const api = makeBridge()
    const created = await api.invoke('project:create', { folderPath: folder, name: 'Harbour' })
    expect(created.ok).toBe(true)

    const opened = await api.invoke('project:open', { folderPath: folder })
    expect(opened.ok).toBe(true)
    if (opened.ok) expect(opened.data.project.name).toBe('Harbour')
  })

  it('returns the recovery warning through the bridge', async () => {
    const api = makeBridge()
    await api.invoke('project:create', { folderPath: folder, name: 'Harbour' })
    await saveProject(folder, {
      ...((await readJson(join(folder, PROJECT_FILE))) as Project),
      name: 'Harbour v2'
    })
    await writeFile(join(folder, PROJECT_FILE), '{ broken', 'utf8')

    const result = (await api.invoke('project:open', { folderPath: folder })) as IpcResult<{
      project: Project
      warning?: string
    }>
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.warning).toBeDefined()
  })

  it('shows the handler message, not a generic failure, for a user-facing error', async () => {
    const api = makeBridge()
    const result = await api.invoke('project:open', { folderPath: join(root, 'missing') })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'HANDLER_FAILED',
        message: 'That folder does not exist.',
        details: join(root, 'missing')
      }
    })
  })

  it('rejects an empty project name as VALIDATION_FAILED', async () => {
    const api = makeBridge()
    const result = await api.invoke('project:create', { folderPath: folder, name: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED')
  })
})
