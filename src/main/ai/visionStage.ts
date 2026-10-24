// The vision stage: describes each shot of a clip from its sampled frames. Frames go to the model as still
// JPEG images, batched by shot; the video itself is never sent. Each batch's result is saved before the
// next one starts, so a failure keeps the shots already described and a later run describes only the
// rest. The key, the monthly cap and the model come from the AI service, which is checked before each
// request. Usage is recorded from the token counts the API reports.
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseShotFrameName } from '@shared/analysis/shots'
import {
  batchItems,
  buildVisionPrompt,
  parseVisionReply,
  retryDelayMs,
  sameFrames,
  VISION_BATCH_SHOTS,
  VISION_MAX_ATTEMPTS,
  VISION_MAX_TOKENS,
  type VisionResultFile,
  type VisionShotResult
} from '@shared/analysis/vision'
import type { StageRunner } from '../analysis/stageRunners'
import { UserFacingError } from '../errors'
import { JobCancelledError, type JobContext } from '../jobs/jobQueue'
import {
  AnthropicRequestError,
  type AnthropicClient,
  type MessageImage,
  type MessageReply,
  type MessageRequest
} from './anthropicClient'
import type { AiService } from './aiService'
import { loadVisionResult, saveVisionResult } from './visionResultFile'

export interface VisionStageOptions {
  /** Waits before a retry. Tests pass a fake, so no time passes. */
  sleep?: (ms: number) => Promise<void>
  /** Shots per request. Defaults to VISION_BATCH_SHOTS. */
  batchShots?: number
}

interface FrameFile {
  name: string
  path: string
  mtimeMs: number
}

interface ShotFrames {
  shotIndex: number
  frames: FrameFile[]
}

export function visionStageRunner(ai: AiService, options: VisionStageOptions = {}): StageRunner {
  const sleep = options.sleep ?? defaultSleep
  const batchSize = options.batchShots ?? VISION_BATCH_SHOTS
  return async (_path, ctx, outDir, resultFile) => {
    if (!outDir || !resultFile) throw new UserFacingError('The vision job lost its folders.')
    await ai.ready()
    if (ai.visionAvailability() !== 'ready') return 'skipped'

    const model = ai.visionModel()
    const client = await ai.client()
    const shots = await framesByShot(outDir)
    const saved = await loadVisionResult(resultFile)

    // Descriptions from an earlier run are kept while the model and the frames are unchanged.
    const described = new Map<number, VisionShotResult>()
    if (saved && saved.model === model) {
      for (const shot of saved.shots) {
        const current = shots.find((item) => item.shotIndex === shot.shotIndex)
        if (current && sameFrames(shot.frames, current.frames)) described.set(shot.shotIndex, shot)
      }
    }
    const save = (): Promise<void> => saveVisionResult(resultFile, toResultFile(model, described))
    ctx.reportProgress(progressOf(described.size, shots.length))

    const todo = shots.filter((shot) => !described.has(shot.shotIndex))
    for (const batch of batchItems(todo, batchSize)) {
      if (ctx.signal.aborted) throw new JobCancelledError()
      // The cap can be reached by an earlier batch, or while the stage waited in the queue.
      if (ai.visionAvailability() !== 'ready') {
        await save()
        return 'skipped'
      }

      const request = await requestFor(model, batch)
      const reply = await sendWithRetry(client, request, sleep, ctx)
      await ai.recordUsage(model, reply.usage)

      const read = parseVisionReply(
        reply.text,
        batch.map((shot) => shot.shotIndex)
      )
      if (!read) throw new UserFacingError('Claude sent a reply the app could not read.')
      const byIndex = new Map(batch.map((shot) => [shot.shotIndex, shot]))
      for (const item of read) {
        const shot = byIndex.get(item.shotIndex)
        if (!shot) continue
        described.set(item.shotIndex, {
          shotIndex: item.shotIndex,
          description: item.description,
          tags: item.tags,
          frames: shot.frames.map(({ name, mtimeMs }) => ({ name, mtimeMs }))
        })
      }
      await save()
      ctx.reportProgress(progressOf(described.size, shots.length))
    }

    await save()
    const missing = shots.length - described.size
    if (missing > 0) {
      throw new UserFacingError(
        `Claude did not describe ${missing} shot${missing === 1 ? '' : 's'}. Analyze again to finish them.`
      )
    }
    return 'done'
  }
}

// Sends one request, waiting and trying again on retryable failures (rate limits, server errors, no
// connection). Anything else, or the last try, is thrown to the stage.
async function sendWithRetry(
  client: AnthropicClient,
  request: MessageRequest,
  sleep: (ms: number) => Promise<void>,
  ctx: JobContext
): Promise<MessageReply> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.sendMessage(request)
    } catch (error) {
      if (!(error instanceof AnthropicRequestError) || !error.retryable) throw error
      if (attempt >= VISION_MAX_ATTEMPTS) throw error
      await sleep(retryDelayMs(attempt, error.retryAfterMs))
      if (ctx.signal.aborted) throw new JobCancelledError()
    }
  }
}

async function requestFor(
  model: MessageRequest['model'],
  batch: ShotFrames[]
): Promise<MessageRequest> {
  const images: MessageImage[] = await Promise.all(
    batch.flatMap((shot) =>
      shot.frames.map(async (frame) => ({
        label: `Shot ${shot.shotIndex}`,
        data: (await readFile(frame.path)).toString('base64')
      }))
    )
  )
  return {
    model,
    maxTokens: VISION_MAX_TOKENS,
    prompt: buildVisionPrompt(batch.map((shot) => shot.shotIndex)),
    images
  }
}

// The sampled frames of each shot in the frame folder, in shot order. A missing folder has no shots.
async function framesByShot(outDir: string): Promise<ShotFrames[]> {
  let names: string[]
  try {
    names = await readdir(outDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const byShot = new Map<number, FrameFile[]>()
  for (const name of names.sort()) {
    const parsed = parseShotFrameName(name)
    if (!parsed) continue
    const path = join(outDir, name)
    const info = await stat(path)
    const frames = byShot.get(parsed.shotIndex) ?? []
    frames.push({ name, path, mtimeMs: info.mtimeMs })
    byShot.set(parsed.shotIndex, frames)
  }
  return [...byShot.entries()]
    .sort(([a], [b]) => a - b)
    .map(([shotIndex, frames]) => ({ shotIndex, frames }))
}

function toResultFile(
  model: VisionResultFile['model'],
  described: Map<number, VisionShotResult>
): VisionResultFile {
  return {
    model,
    shots: [...described.values()].sort((a, b) => a.shotIndex - b.shotIndex)
  }
}

function progressOf(done: number, total: number): number {
  return total === 0 ? 1 : done / total
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
