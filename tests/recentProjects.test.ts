import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { createIpcHandlers } from '../src/main/ipc/handlers'
import { createProject, openProject, saveProject } from '../src/main/project/projectStorage'
import {
  listRecentProjects,
  locateRecentProject,
  readRegistry,
  recordRecentProject,
  removeRecentProject
} from '../src/main/project/recentProjects'
import type { Short } from '@shared/project/schema'

let root: string
let registry: string
let folder: string

const t1 = new Date('2026-01-01T10:00:00Z')
const t2 = new Date('2026-01-02T10:00:00Z')
const t3 = new Date('2026-01-03T10:00:00Z')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ass-recent-'))
  registry = join(root, 'recent-projects.json')
  folder = join(root, 'Harbour shoot')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function createAndRecord(path: string, name: string, when: Date) {
  const opened = await createProject(path, name)
  await recordRecentProject(registry, opened, when)
  return opened
}

describe('recent projects registry', () => {
  it('records a created project with its name, short count and thumbnail path', async () => {
    const opened = await createAndRecord(folder, 'Harbour', t1)
    expect(await listRecentProjects(registry)).toEqual([
      {
        folderPath: folder,
        name: 'Harbour',
        lastOpened: t1.toISOString(),
        shortCount: 0,
        thumbnailPath: join(folder, 'cache', 'thumbs', `${opened.project.id}.jpg`),
        missing: false
      }
    ])
  })

  it('refreshes an existing entry instead of duplicating it, newest first', async () => {
    await createAndRecord(folder, 'Harbour', t1)
    const other = join(root, 'Studio')
    await createAndRecord(other, 'Studio', t2)

    await recordRecentProject(registry, await openProject(folder), t3)

    const listed = await listRecentProjects(registry)
    expect(listed.map((project) => project.folderPath)).toEqual([folder, other])
    expect(listed[0].lastOpened).toBe(t3.toISOString())
  })

  it('updates the short count when a project has shorts', async () => {
    const opened = await createAndRecord(folder, 'Harbour', t1)
    const short: Short = {
      id: 'short_1',
      name: 'Cold open',
      createdAt: t1.toISOString(),
      updatedAt: t1.toISOString(),
      status: 'draft',
      order: 0,
      targetLength: { minSec: 30, maxSec: 60 },
      platform: 'generic',
      overrides: {},
      editedSinceExport: false,
      timeline: { tracks: [] }
    }
    await saveProject(folder, { ...opened.project, shorts: [short] })
    await recordRecentProject(registry, await openProject(folder), t2)

    expect((await listRecentProjects(registry))[0].shortCount).toBe(1)
  })

  it('keeps an entry whose folder is gone and marks it missing', async () => {
    await createAndRecord(folder, 'Harbour', t1)
    await rm(folder, { recursive: true, force: true })

    const listed = await listRecentProjects(registry)
    expect(listed).toHaveLength(1)
    expect(listed[0].missing).toBe(true)
  })

  it('removes an entry from the registry but leaves the folder on disk', async () => {
    await createAndRecord(folder, 'Harbour', t1)
    await removeRecentProject(registry, folder)

    expect(await listRecentProjects(registry)).toEqual([])
    expect(existsSync(join(folder, 'project.json'))).toBe(true)
  })

  it('locates a moved project and points its entry at the new folder', async () => {
    await createAndRecord(folder, 'Harbour', t1)
    const moved = join(root, 'Moved shoot')
    await rename(folder, moved)
    expect((await listRecentProjects(registry))[0].missing).toBe(true)

    const located = await locateRecentProject(registry, folder, await openProject(moved), t2)

    expect(located).toMatchObject({ folderPath: moved, missing: false })
    const listed = await listRecentProjects(registry)
    expect(listed.map((project) => project.folderPath)).toEqual([moved])
    expect(listed[0].missing).toBe(false)
  })

  it('treats a damaged registry file as empty and rebuilds it on the next record', async () => {
    await writeFile(registry, '{ not json', 'utf8')
    expect(await listRecentProjects(registry)).toEqual([])

    await createAndRecord(folder, 'Harbour', t1)
    expect(await listRecentProjects(registry)).toHaveLength(1)
  })

  it('skips invalid entries in the registry and keeps the valid ones', async () => {
    await createAndRecord(folder, 'Harbour', t1)
    const text = await readFile(registry, 'utf8')
    const [valid] = JSON.parse(text)
    await writeFile(registry, JSON.stringify([valid, { folderPath: 'x' }]), 'utf8')

    expect(await readRegistry(registry)).toEqual([valid])
  })
})

describe('recent projects IPC channels', () => {
  function makeBridge() {
    const handlers = createIpcHandlers({
      layoutFile: join(root, 'ui-layout.json'),
      recentFile: registry
    })
    return createBridge((channel, input) => routeIpc(handlers, channel, input))
  }

  it('lists a project that was created over IPC, then removes it', async () => {
    const api = makeBridge()
    await api.invoke('project:create', { folderPath: folder, name: 'Harbour' })

    const listed = await api.invoke('recent:list', {})
    expect(listed.ok && listed.data.projects.map((project) => project.name)).toEqual(['Harbour'])

    expect(await api.invoke('recent:remove', { folderPath: folder })).toEqual({
      ok: true,
      data: { removed: true }
    })
    expect(await api.invoke('recent:list', {})).toEqual({ ok: true, data: { projects: [] } })
  })

  it('refuses to locate a folder that is not a project', async () => {
    const api = makeBridge()
    await api.invoke('project:create', { folderPath: folder, name: 'Harbour' })
    const empty = join(root, 'Empty')
    await mkdir(empty)

    const result = await api.invoke('recent:locate', {
      oldFolderPath: folder,
      newFolderPath: empty
    })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toBe('This folder is not an AI Shorts Studio project.')
  })
})
