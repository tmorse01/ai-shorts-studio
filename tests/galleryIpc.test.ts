import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers, type SystemActions } from '../src/main/ipc/handlers'
import { createProject } from '../src/main/project/projectStorage'
import { listRecentProjects, recordRecentProject } from '../src/main/project/recentProjects'

let root: string
let registry: string
let folder: string
let revealed: string[]
let trashed: string[]

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ass-gallery-'))
  registry = join(root, 'recent-projects.json')
  folder = join(root, 'Harbour shoot')
  revealed = []
  trashed = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function setup(overrides: Partial<SystemActions> = {}) {
  const system: SystemActions = {
    pickFolder: async () => folder,
    pickMediaFiles: async () => [],
    revealFolder: (path) => {
      revealed.push(path)
    },
    trashFolder: async (path) => {
      trashed.push(path)
    },
    documentsDir: () => join(root, 'Documents'),
    ...overrides
  }
  const handlers = createIpcHandlers({
    layoutFile: join(root, 'ui-layout.json'),
    recentFile: registry,
    system
  })
  return createBridge((channel, input) => routeIpc(handlers, channel, input))
}

describe('project:rename', () => {
  it('saves the new name to project.json and to the recent projects entry', async () => {
    const opened = await createProject(folder, 'Harbour')
    await recordRecentProject(registry, opened)
    const api = setup()

    expect(await api.invoke('project:rename', { folderPath: folder, name: 'Harbour v2' })).toEqual({
      ok: true,
      data: { name: 'Harbour v2' }
    })

    const saved = JSON.parse(await readFile(join(folder, 'project.json'), 'utf8'))
    expect(saved.name).toBe('Harbour v2')
    expect((await listRecentProjects(registry))[0].name).toBe('Harbour v2')
  })

  it('fails with a plain message when the folder is not a project', async () => {
    const api = setup()
    const result = await api.invoke('project:rename', { folderPath: root, name: 'Nope' })
    expect(result.ok).toBe(false)
  })
})

describe('project:defaultFolder', () => {
  it('suggests a folder under Documents/AI Shorts Studio named after the project', async () => {
    const api = setup()
    expect(await api.invoke('project:defaultFolder', { name: 'Harbour: shoot' })).toEqual({
      ok: true,
      data: { folderPath: join(root, 'Documents', 'AI Shorts Studio', 'Harbour- shoot') }
    })
  })
})

describe('project:deleteFolder', () => {
  it('moves the folder to the Recycle Bin and drops its registry entry', async () => {
    const opened = await createProject(folder, 'Harbour')
    await recordRecentProject(registry, opened)
    const api = setup()

    expect(await api.invoke('project:deleteFolder', { folderPath: folder })).toEqual({
      ok: true,
      data: { deleted: true }
    })
    expect(trashed).toEqual([folder])
    expect(await listRecentProjects(registry)).toEqual([])
  })
})

describe('folder:pick', () => {
  it('returns the folder the user picked', async () => {
    const api = setup()
    expect(await api.invoke('folder:pick', {})).toEqual({
      ok: true,
      data: { folderPath: folder }
    })
  })

  it('returns null when the user cancels', async () => {
    const api = setup({ pickFolder: async () => null })
    expect(await api.invoke('folder:pick', {})).toEqual({
      ok: true,
      data: { folderPath: null }
    })
  })
})

describe('folder:reveal', () => {
  it('asks the shell to show the folder in Explorer', async () => {
    const api = setup()
    expect(await api.invoke('folder:reveal', { folderPath: folder })).toEqual({
      ok: true,
      data: { revealed: true }
    })
    expect(revealed).toEqual([folder])
  })
})

describe('system actions left out', () => {
  it('fails the request instead of doing nothing', async () => {
    const handlers = createIpcHandlers({ layoutFile: join(root, 'l.json'), recentFile: registry })
    const api = createBridge((channel, input) => routeIpc(handlers, channel, input))
    const result = await api.invoke('folder:pick', {})
    expect(result.ok).toBe(false)
  })
})
