import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHistoryStore } from '@renderer/features/history/historyStore'
import {
  matchOfflineMedia,
  relinkMediaRecipe,
  type MediaLocation
} from '@shared/project/mediaRelink'
import { CURRENT_SCHEMA_VERSION, type MediaRef, type Project } from '@shared/project/schema'
import { createBridge } from '../src/preload/bridge'
import { routeIpc } from '../src/main/ipc/dispatch'
import { ipcHandlers } from '../src/main/ipc/handlers'
import { storedMediaPath, resolveMediaPath } from '../src/main/media/mediaPaths'
import { relinkMediaFolder } from '../src/main/media/relinkMedia'
import { createProject, openProject, saveProject } from '../src/main/project/projectStorage'
import type { IpcResult } from '@shared/ipc'

const ref = (
  id: string,
  fileName: string,
  sizeBytes: number,
  path = `footage/${fileName}`
): MediaRef => ({
  id,
  path,
  pathKind: 'relative',
  fileName,
  sizeBytes,
  kind: 'video'
})

let root: string
let folder: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ass-relink-'))
  folder = join(root, 'Shoot')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('storedMediaPath', () => {
  const project = resolve('projects', 'Shoot')

  it('stores a file inside the project folder as a relative path with forward slashes', () => {
    const stored = storedMediaPath(project, join(project, 'footage', 'a.mp4'))
    expect(stored).toEqual({ path: 'footage/a.mp4', pathKind: 'relative' })
  })

  it('stores a file directly beside the project folder as a relative path', () => {
    const stored = storedMediaPath(project, resolve('projects', 'a.mp4'))
    expect(stored).toEqual({ path: '../a.mp4', pathKind: 'relative' })
  })

  it('stores a file further away as an absolute path', () => {
    const far = resolve('elsewhere', 'deep', 'a.mp4')
    expect(storedMediaPath(project, far)).toEqual({ path: far, pathKind: 'absolute' })
    const sibling = resolve('projects', 'other', 'a.mp4')
    expect(storedMediaPath(project, sibling)).toEqual({ path: sibling, pathKind: 'absolute' })
  })
})

describe('resolveMediaPath', () => {
  it('joins a relative path onto the project folder and leaves an absolute path alone', () => {
    const project = resolve('projects', 'Shoot')
    expect(resolveMediaPath(project, ref('m', 'a.mp4', 1))).toBe(resolve(project, 'footage/a.mp4'))

    const absolute = {
      ...ref('m', 'a.mp4', 1),
      path: resolve('x', 'a.mp4'),
      pathKind: 'absolute' as const
    }
    expect(resolveMediaPath(project, absolute)).toBe(resolve('x', 'a.mp4'))
  })
})

describe('matchOfflineMedia', () => {
  it('matches by file name and size, ignoring the case of the name', () => {
    const offline = [ref('m1', 'Clip.MP4', 100)]
    const files = [{ path: '/disk/clip.mp4', fileName: 'clip.mp4', sizeBytes: 100 }]
    const result = matchOfflineMedia(offline, files)
    expect(result.matches).toEqual([{ mediaId: 'm1', path: '/disk/clip.mp4' }])
    expect(result.unmatched).toEqual([])
  })

  it('does not match a file with the same name but a different size', () => {
    const offline = [ref('m1', 'a.mp4', 100)]
    const files = [{ path: '/disk/a.mp4', fileName: 'a.mp4', sizeBytes: 101 }]
    const result = matchOfflineMedia(offline, files)
    expect(result.matches).toEqual([])
    expect(result.unmatched.map((item) => item.id)).toEqual(['m1'])
  })

  it('takes the first file when several share a name and size', () => {
    const offline = [ref('m1', 'a.mp4', 5)]
    const files = [
      { path: '/disk/1/a.mp4', fileName: 'a.mp4', sizeBytes: 5 },
      { path: '/disk/2/a.mp4', fileName: 'a.mp4', sizeBytes: 5 }
    ]
    expect(matchOfflineMedia(offline, files).matches[0]?.path).toBe('/disk/1/a.mp4')
  })
})

describe('relink as one undoable command', () => {
  it('restores every relinked path with a single undo', () => {
    const original = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      media: [ref('m1', 'a.mp4', 1), ref('m2', 'b.mp4', 2)]
    }
    const history = createHistoryStore({ media: original.media })
    const locations: MediaLocation[] = [
      { mediaId: 'm1', path: '/new/a.mp4', pathKind: 'absolute' },
      { mediaId: 'm2', path: '../b.mp4', pathKind: 'relative' }
    ]

    history.getState().execute({ label: 'Relink media', produce: relinkMediaRecipe(locations) })
    expect(history.getState().present.media.map((item) => item.path)).toEqual([
      '/new/a.mp4',
      '../b.mp4'
    ])
    expect(history.getState().past).toHaveLength(1)

    history.getState().undo()
    expect(history.getState().present.media).toEqual(original.media)
    expect(history.getState().past).toHaveLength(0)
  })
})

describe('openProject offline detection', () => {
  it('flags media whose files are missing and leaves present media alone', async () => {
    const created = await createProject(folder, 'Shoot')
    await mkdir(join(folder, 'footage'), { recursive: true })
    await writeFile(join(folder, 'footage', 'here.mp4'), 'abc')
    const project: Project = {
      ...created.project,
      media: [ref('here', 'here.mp4', 3), ref('gone', 'gone.mp4', 3)]
    }
    await saveProject(folder, project)

    const opened = await openProject(folder)
    expect(opened.offlineMediaIds).toEqual(['gone'])
  })
})

describe('relinkMediaFolder', () => {
  async function setUpProjectWithMissingFootage() {
    await createProject(folder, 'Shoot')
    const created = await openProject(folder)
    const project: Project = {
      ...created.project,
      media: [ref('a', 'a.mp4', 3), ref('b', 'b.mov', 4), ref('c', 'c.mp4', 9)]
    }
    await saveProject(folder, project)
    // Searched folder: a.mp4 is here (moved, same size), b.mov is here, c.mp4 is not.
    const search = join(root, 'Drive')
    await mkdir(join(search, 'deep'), { recursive: true })
    await writeFile(join(search, 'deep', 'A.mp4'), 'abc')
    await writeFile(join(search, 'b.mov'), 'dddd')
    await writeFile(join(search, 'other.mp4'), 'xx')
    return search
  }

  it('relinks matches, reports unmatched files and saves once', async () => {
    const search = await setUpProjectWithMissingFootage()

    const result = await relinkMediaFolder(folder, search)

    expect(result.relinkedCount).toBe(2)
    expect(result.unmatchedFileNames).toEqual(['c.mp4'])
    expect(result.offlineMediaIds).toEqual(['c'])

    const byId = Object.fromEntries(result.project.media.map((item) => [item.id, item]))
    expect(byId.a).toMatchObject({ pathKind: 'absolute', path: join(search, 'deep', 'A.mp4') })
    expect(byId.b).toMatchObject({ pathKind: 'absolute', path: join(search, 'b.mov') })

    const reopened = await openProject(folder)
    expect(reopened.project.media).toEqual(result.project.media)
    expect(reopened.offlineMediaIds).toEqual(['c'])
  })

  it('stores a match beside the project folder as a relative path', async () => {
    await createProject(folder, 'Shoot')
    const created = await openProject(folder)
    await saveProject(folder, { ...created.project, media: [ref('a', 'a.mp4', 3)] })
    await writeFile(join(root, 'a.mp4'), 'abc')

    const result = await relinkMediaFolder(folder, root)

    expect(result.project.media[0]).toMatchObject({ pathKind: 'relative', path: '../a.mp4' })
    expect(result.offlineMediaIds).toEqual([])
  })

  it('rejects a search folder that does not exist', async () => {
    await setUpProjectWithMissingFootage()
    await expect(relinkMediaFolder(folder, join(root, 'nope'))).rejects.toThrow(
      'That folder does not exist.'
    )
  })
})

describe('project:relinkFolder round trip', () => {
  it('validates the request and returns the relink result', async () => {
    await createProject(folder, 'Shoot')
    const created = await openProject(folder)
    await saveProject(folder, { ...created.project, media: [ref('a', 'a.mp4', 3)] })
    await writeFile(join(root, 'a.mp4'), 'abc')

    const api = createBridge((channel, input) => routeIpc(ipcHandlers, channel, input))
    const result: IpcResult<unknown> = await api.invoke('project:relinkFolder', {
      folderPath: folder,
      searchFolder: root
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toMatchObject({ relinkedCount: 1, unmatchedFileNames: [] })
    }
  })
})
