import { describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import {
  JobQueue,
  unavailableExecutors,
  type JobContext,
  type JobExecutors,
  type JobInput
} from '../src/main/jobs/jobQueue'
import { RenderQueueService, type RenderQueueDeps } from '../src/main/export/renderQueue'
import type { ExportJobInput } from '../src/main/export/exportJob'
import { DEFAULT_EXPORT_SETTINGS, type EncoderInfo } from '@shared/export/exportSettings'
import type { Project } from '@shared/project/schema'
import type { Timeline } from '@shared/timeline/timeline'
import { setShortExported } from '@shared/export/shortExport'
import { UserFacingError } from '../src/main/errors'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }
const FOLDER = join('C:', 'Projects', 'Demo')

const footage: Timeline = {
  tracks: [
    {
      id: 'main',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [
        {
          id: 'c1',
          mediaId: 'm1',
          startMs: 0,
          durationMs: 4000,
          sourceInMs: 0,
          transform: IDENTITY
        }
      ]
    }
  ]
}

function short(id: string, name: string, timeline: Timeline, status = 'ready') {
  return {
    id,
    name,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    status,
    order: 0,
    targetLength: { minSec: 20, maxSec: 45 },
    platform: 'youtube',
    overrides: {},
    editedSinceExport: false,
    timeline
  }
}

function projectWith(shorts: unknown[]): Project {
  return {
    schemaVersion: 19,
    id: 'p1',
    name: 'Demo',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    media: [
      {
        id: 'm1',
        path: 'cam.mp4',
        pathKind: 'relative',
        fileName: 'cam.mp4',
        sizeBytes: 10,
        kind: 'video'
      }
    ],
    mediaTags: [],
    moments: [],
    defaults: {},
    shorts,
    scripts: []
  } as unknown as Project
}

interface Pending {
  input: ExportJobInput | undefined
  ctx: JobContext
  resolve: (value: { outPath: string }) => void
  reject: (error: unknown) => void
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// The export job is held by the test, so each step of the queue can be checked. No FFmpeg runs.
function setup(
  options: { concurrency?: number; encoder?: EncoderInfo | null; project?: Project } = {}
) {
  const started: Pending[] = []
  const executors: JobExecutors = {
    ...unavailableExecutors(),
    export: ((input: JobInput, ctx: JobContext) =>
      new Promise<{ outPath: string }>((resolve, reject) => {
        started.push({ input: input.export, ctx, resolve, reject })
      })) as JobExecutors['export']
  }
  const queue = new JobQueue(executors, options.concurrency ?? 2)
  let clock = 1000
  const exported: { shortId: string; exportedAt: string }[] = []
  const written: Project[] = []
  const revealed: string[] = []
  const existing = new Set<string>()
  const encoder = options.encoder === undefined ? ENCODER : options.encoder
  const project = options.project ?? projectWith([short('s1', 'Hook', footage)])
  const deps: RenderQueueDeps = {
    queue,
    readProject: async () => project,
    writeProject: async (_folder, saved) => {
      written.push(saved)
    },
    readSettings: async () => DEFAULT_EXPORT_SETTINGS,
    encoder: () => encoder,
    fileExists: async (path) => existing.has(path),
    reveal: (path) => revealed.push(path),
    onExported: (event) => exported.push({ shortId: event.shortId, exportedAt: event.exportedAt }),
    now: () => clock
  }
  const service = new RenderQueueService(deps)
  return {
    service,
    queue,
    started,
    exported,
    written,
    revealed,
    existing,
    advance: (ms: number) => {
      clock += ms
    }
  }
}

const ENCODER: EncoderInfo = {
  encoder: 'libx264',
  hardware: false,
  fallback: true,
  ffmpegVersion: '6.1.1',
  amixNormalizeSupported: true
}

describe('RenderQueueService', () => {
  it('queues one export per short, with the file name and settings the export needs', async () => {
    const { service, started } = setup()
    const jobs = await service.start(FOLDER, ['s1'])
    await tick()

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      shortName: 'Hook',
      fileName: 'Demo - Hook.mp4',
      status: 'running'
    })
    const input = started[0]?.input
    expect(input?.encoder).toBe('libx264')
    expect(input?.fps).toBe(30)
    expect(input?.videoKbps).toBe(10000)
    expect(input?.outPath).toBe(join(FOLDER, 'exports', 'Demo - Hook.mp4'))
    expect(input?.media).toEqual([{ id: 'm1', path: join(FOLDER, 'cam.mp4') }])
  })

  it('shows progress and time left from the time the encode started', async () => {
    const { service, started, advance } = setup()
    await service.start(FOLDER, ['s1'])
    await tick()
    advance(10000)
    started[0]?.ctx.reportProgress(0.25)

    const [job] = service.list()
    expect(job?.progress).toBe(0.25)
    expect(job?.etaSec).toBe(30)
  })

  it('records the short as Exported when its file is in place', async () => {
    const { service, started, exported, written } = setup()
    await service.start(FOLDER, ['s1'])
    await tick()
    started[0]?.resolve({ outPath: join(FOLDER, 'exports', 'Demo - Hook.mp4') })
    await tick()
    await tick()

    expect(service.list()[0]?.status).toBe('done')
    expect(exported).toHaveLength(1)
    expect(exported[0]?.shortId).toBe('s1')
    const saved = written[0]?.shorts[0]
    expect(saved).toMatchObject({ status: 'exported', editedSinceExport: false })
    expect(saved?.exportedAt).toBe(exported[0]?.exportedAt)
  })

  it('leaves the short alone when the export fails, and keeps the failure for the queue', async () => {
    const { service, started, exported, written } = setup()
    await service.start(FOLDER, ['s1'])
    await tick()
    started[0]?.reject(new UserFacingError('Export failed.', 'ffmpeg exited with code 1'))
    await tick()

    const [job] = service.list()
    expect(job?.status).toBe('failed')
    expect(job?.error).toEqual({ message: 'Export failed.', details: 'ffmpeg exited with code 1' })
    expect(exported).toEqual([])
    expect(written).toEqual([])
  })

  it('cancels a queued export without starting it', async () => {
    const project = projectWith([short('s1', 'Hook', footage), short('s2', 'Tail', footage)])
    const { service, started } = setup({ concurrency: 1, project })
    await service.start(FOLDER, ['s1', 's2'])
    await tick()
    const queued = service.list().find((job) => job.status === 'queued')
    expect(queued?.shortName).toBe('Tail')
    expect(started).toHaveLength(1)

    expect(queued && service.cancel(queued.id)).toBe(true)
    await tick()
    expect(service.list().find((job) => job.shortName === 'Tail')?.status).toBe('cancelled')
    expect(started).toHaveLength(1)
    expect(service.cancel('no-such-job')).toBe(false)
  })

  it('queues nothing when one short cannot be exported', async () => {
    const project = projectWith([
      short('s1', 'Hook', footage),
      short('s2', 'Empty', { tracks: [] }, 'ready')
    ])
    const { service, started } = setup({ project })
    await expect(service.start(FOLDER, ['s1', 's2'])).rejects.toThrow('has no clips to export')
    await tick()
    expect(started).toEqual([])
    expect(service.list()).toEqual([])
  })

  it('will not start while the encoder is still being checked', async () => {
    const { service, started } = setup({ encoder: null })
    await expect(service.start(FOLDER, ['s1'])).rejects.toThrow('still checking the encoder')
    expect(started).toEqual([])
  })

  it('names a second export of the same short so it does not replace the first', async () => {
    const { service, started, existing } = setup()
    existing.add(join(FOLDER, 'exports', 'Demo - Hook.mp4'))
    await service.start(FOLDER, ['s1'])
    await tick()
    expect(started[0]?.input?.outPath).toBe(join(FOLDER, 'exports', 'Demo - Hook (2).mp4'))
  })

  it('opens the folder for an unfinished export and the file once it is done', async () => {
    const { service, started, revealed } = setup({ concurrency: 1 })
    const [job] = await service.start(FOLDER, ['s1'])
    if (!job) throw new Error('no job')
    await tick()
    service.reveal(job.id)
    expect(revealed).toEqual([dirname(join(FOLDER, 'exports', 'Demo - Hook.mp4'))])

    started[0]?.resolve({ outPath: join(FOLDER, 'exports', 'Demo - Hook.mp4') })
    await tick()
    await tick()
    service.reveal(job.id)
    expect(revealed[1]).toBe(join(FOLDER, 'exports', 'Demo - Hook.mp4'))
    expect(() => service.reveal('gone')).toThrow('no longer in the queue')
  })
})

describe('setShortExported', () => {
  it('marks only the named short, clears the edit flag and sets the export time', () => {
    const project = projectWith([
      short('s1', 'Hook', footage, 'ready'),
      { ...short('s2', 'Tail', footage, 'exported'), editedSinceExport: true }
    ])
    const updated = setShortExported(project, 's2', '2026-10-24T10:00:00.000Z')
    expect(updated?.shorts[0]).toMatchObject({ status: 'ready' })
    expect(updated?.shorts[1]).toMatchObject({
      status: 'exported',
      exportedAt: '2026-10-24T10:00:00.000Z',
      editedSinceExport: false
    })
    expect(setShortExported(project, 'missing', '2026-10-24T10:00:00.000Z')).toBeNull()
  })
})
