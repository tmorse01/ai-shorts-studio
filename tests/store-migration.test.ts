import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateState } from '../src/main/migrate'
import { Store } from '../src/main/store'

const probe = { durationSec: 60, width: 1920, height: 1080, videoCodec: 'h264', hasAudio: true }
const stamp = '2026-01-01T00:00:00.000Z'

const v1State = {
  version: 1,
  projects: [
    {
      id: 'proj-with-video',
      name: 'Interview',
      sourcePath: 'C:\\Footage\\interview.mp4',
      probe,
      proxyPath: null,
      createdAt: stamp,
      updatedAt: stamp
    },
    { id: 'proj-empty', name: 'Blank', sourcePath: null, probe: null, proxyPath: null, createdAt: stamp, updatedAt: stamp }
  ],
  shorts: [
    {
      id: 'short-1',
      projectId: 'proj-with-video',
      title: 'Hook',
      reason: '',
      provenance: 'ai',
      rank: 1,
      segments: [{ startSec: 0, endSec: 30 }],
      captions: [],
      narrationPath: null,
      settings: {},
      exportedPath: null,
      createdAt: stamp,
      updatedAt: stamp
    }
  ],
  jobs: [],
  settings: { musicFolder: 'D:\\Music', lastExport: null }
}

describe('state migration v1 → v3', () => {
  it('turns a project video into its first media asset', () => {
    const { state, migrated } = migrateState(v1State)
    expect(migrated).toBe(true)
    const withVideo = state.projects.find((p) => p.id === 'proj-with-video')!
    expect(withVideo.media).toHaveLength(1)
    expect(withVideo.media[0]).toMatchObject({
      name: 'interview.mp4',
      kind: 'source',
      path: 'C:\\Footage\\interview.mp4',
      probe,
      proxyPath: null
    })
    expect(state.projects.find((p) => p.id === 'proj-empty')!.media).toEqual([])
  })

  it('points each existing short at its project source and drops the old per-project music folder', () => {
    const { state } = migrateState(v1State)
    const sourceId = state.projects[0].media[0].id
    expect(state.shorts[0]).toMatchObject({ sourceId })
    expect(state.projects.every((p) => !('musicFolder' in p))).toBe(true)
    expect(state.version).toBe(3)
  })

  it('leaves a current-version file alone', () => {
    const current = migrateState(v1State).state
    const again = migrateState(JSON.parse(JSON.stringify(current)))
    expect(again.migrated).toBe(false)
    expect(again.state).toEqual(current)
  })
})

describe('Store on disk', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'store-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates a v1 file, backs it up once, and writes v2 back', () => {
    writeFileSync(join(dir, 'state.json'), JSON.stringify(v1State))
    const store = new Store(dir)
    expect(existsSync(join(dir, 'state.before-migration.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).version).toBe(3)
    expect(store.getProject('proj-with-video').media).toHaveLength(1)
  })

  it('keeps several videos per project and only refuses to remove one a clip still uses', () => {
    const store = new Store(dir)
    const project = store.createProject('Multi')
    const make = (name: string, id: string) => ({
      id,
      name,
      kind: 'source' as const,
      path: `C:\\Footage\\${name}`,
      probe,
      proxyPath: null,
      createdAt: stamp
    })
    store.addMediaAssets(project.id, [make('a.mp4', 'asset-a'), make('b.mp4', 'asset-b')])
    expect(store.getProject(project.id).media.map((m) => m.name)).toEqual(['a.mp4', 'b.mp4'])

    store.addShorts([
      {
        projectId: project.id,
        sourceId: 'asset-a',
        title: 'Clip',
        reason: '',
        provenance: 'manual',
        rank: null,
        segments: [{ startSec: 0, endSec: 15 }],
        captions: [],
        narrationPath: null,
        settings: {} as never,
        exportedPath: null
      }
    ])

    expect(() => store.removeMediaAsset('asset-a')).toThrow(/1 clip uses this video/)
    expect(() => store.removeMediaAsset('asset-b')).not.toThrow()
    expect(store.getProject(project.id).media.map((m) => m.id)).toEqual(['asset-a'])
  })
})
