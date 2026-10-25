// The IPC contract shared by main, preload and renderer. Every channel is defined once here with a
// zod schema for its request and its response. Main validates requests and responses with these
// schemas; the preload bridge checks responses too, so a drifted main process fails loudly.
import { z } from 'zod'
import { appErrorSchema } from './errors'
import { uiLayoutSchema } from './layout'
import { encoderInfoSchema, exportSettingsSchema } from './export/exportSettings'
import { renderJobSchema } from './export/renderQueue'
import { mediaKindSchema, pathKindSchema, projectSchema } from './project/schema'
import { posterFrameRefSchema } from './shorts/poster'
import { recentProjectSchema } from './project/recentProjects'
import { probeResultSchema } from './media/probe'
import { jobSnapshotSchema } from './media/jobs'
import { importCandidateSchema } from './media/importFiles'
import { analysisFileSchema, analysisStageSchema, visionDecisionSchema } from './analysis/analysis'
import { batchSchema, MAX_BATCH_ITEMS } from './batch/batch'
import { transcriptSchema } from './analysis/transcript'
import { visionShotSchema } from './analysis/vision'
import { suggestionsOutputSchema } from './analysis/suggestions'
import { footageMatchRequestSchema, footageMatchResultSchema } from './assembly/footageMatchRequest'
import {
  aiStatusSchema,
  MAX_CAP_USD,
  visionEstimateSchema,
  visionModelSchema
} from './ai/aiSettings'
import {
  generatedScriptSchema,
  scriptEstimateSchema,
  scriptRunInputSchema
} from './ai/scriptGeneration'
import { lineRewriteInputSchema, lineRewriteOutputSchema } from './ai/lineRewrite'

const analysisItemSchema = z.object({
  id: z.string().min(1),
  path: z.string().trim().min(1)
})
import { THUMB_READ_FILES } from './media/thumbs'
import { mediaSourceInfoSchema, mediaSourceRefSchema } from './media/mediaSources'

export const ipcErrorCodeSchema = z.enum([
  'UNKNOWN_CHANNEL',
  'VALIDATION_FAILED',
  'HANDLER_FAILED',
  'TRANSPORT_FAILED',
  'INVALID_RESPONSE'
])
export type IpcErrorCode = z.infer<typeof ipcErrorCodeSchema>

export const ipcErrorSchema = z.object({
  code: ipcErrorCodeSchema,
  // Plain-language message, safe to show in a toast.
  message: z.string(),
  // Technical detail for the toast's details view. Never a stack trace.
  details: z.string().optional()
})
export type IpcError = z.infer<typeof ipcErrorSchema>

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export function ipcResultSchema<T extends z.ZodType>(output: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: output }),
    z.object({ ok: z.literal(false), error: ipcErrorSchema })
  ])
}

export function ipcFailure(
  code: IpcErrorCode,
  message: string,
  details?: string
): IpcResult<never> {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } }
}

// One entry per channel. Add new channels here, then add a handler in src/main/ipc/handlers.ts.
const projectOpenedSchema = z.object({
  folderPath: z.string().min(1),
  project: projectSchema,
  // Ids of media whose files are not on disk.
  offlineMediaIds: z.array(z.string()),
  // Plain-language warning for a toast, for example when the project was recovered from its backup.
  warning: z.string().optional()
})

const relinkResultSchema = z.object({
  folderPath: z.string().min(1),
  project: projectSchema,
  offlineMediaIds: z.array(z.string()),
  relinkedCount: z.number().int().nonnegative(),
  // File names of offline media the searched folder did not contain.
  unmatchedFileNames: z.array(z.string())
})

// Most shorts one export request can start. Keeps a single request from queuing a whole project by accident.
const MAX_EXPORT_SHORTS = 100

export const ipcChannels = {
  'app:echo': {
    input: z.object({ text: z.string().trim().min(1).max(200) }),
    output: z.object({ text: z.string(), length: z.number().int().nonnegative() })
  },
  // The renderer reports its own uncaught errors so main can write them to the log file.
  'app:report-error': {
    input: z.object({
      message: z.string().trim().min(1).max(2000),
      details: z.string().max(2000).optional(),
      context: z.string().max(200).optional(),
      stack: z.string().max(20000).optional()
    }),
    output: z.object({ logged: z.literal(true) })
  },
  'project:create': {
    input: z.object({
      folderPath: z.string().trim().min(1),
      name: z.string().trim().min(1).max(120)
    }),
    output: projectOpenedSchema
  },
  'project:open': {
    input: z.object({ folderPath: z.string().trim().min(1) }),
    output: projectOpenedSchema
  },
  'project:save': {
    input: z.object({ folderPath: z.string().trim().min(1), project: projectSchema }),
    output: z.object({ savedAt: z.iso.datetime() })
  },
  'project:relinkFolder': {
    input: z.object({
      folderPath: z.string().trim().min(1),
      searchFolder: z.string().trim().min(1)
    }),
    output: relinkResultSchema
  },
  'project:rename': {
    input: z.object({
      folderPath: z.string().trim().min(1),
      name: z.string().trim().min(1).max(120)
    }),
    output: z.object({ name: z.string().min(1) })
  },
  // Default folder for a new project, from the project name and the user's Documents folder.
  'project:defaultFolder': {
    input: z.object({ name: z.string().trim().min(1).max(120) }),
    output: z.object({ folderPath: z.string().min(1) })
  },
  // Moves a project folder to the Recycle Bin, then drops its registry entry.
  'project:deleteFolder': {
    input: z.object({ folderPath: z.string().trim().min(1) }),
    output: z.object({ deleted: z.literal(true) })
  },
  // Native folder picker. Null when the user cancels.
  'folder:pick': {
    input: z.object({}),
    output: z.object({ folderPath: z.string().min(1).nullable() })
  },
  'folder:reveal': {
    input: z.object({ folderPath: z.string().trim().min(1) }),
    output: z.object({ revealed: z.literal(true) })
  },
  // Recent projects registry. Remove only drops the entry; the project folder is left alone.
  // Locate points a missing entry at a folder that holds the same project, after opening it.
  'recent:list': {
    input: z.object({}),
    output: z.object({ projects: z.array(recentProjectSchema) })
  },
  'recent:remove': {
    input: z.object({ folderPath: z.string().trim().min(1) }),
    output: z.object({ removed: z.literal(true) })
  },
  'recent:locate': {
    input: z.object({
      oldFolderPath: z.string().trim().min(1),
      newFolderPath: z.string().trim().min(1)
    }),
    output: z.object({ project: recentProjectSchema })
  },
  // Editor pane layout, saved between launches. Stored by main as a JSON file in user data.
  'ui:layout:load': {
    input: z.object({}),
    output: z.object({ layout: uiLayoutSchema.nullable() })
  },
  'ui:layout:save': {
    input: z.object({ layout: uiLayoutSchema }),
    output: z.object({ saved: z.literal(true) })
  },
  // Export state: the encoder found at startup (null until detection ends) and the shared export
  // settings (presets, naming, output folder). Saved by main as a JSON file in user data.
  'export:state:get': {
    input: z.object({}),
    output: z.object({
      encoder: encoderInfoSchema.nullable(),
      settings: exportSettingsSchema.nullable()
    })
  },
  'export:settings:save': {
    input: z.object({ settings: exportSettingsSchema }),
    output: z.object({ saved: z.literal(true) })
  },
  // The render queue: exports of shorts, run on the media job queue. Main reads each short from the
  // project on disk, so the renderer saves its pending edits before it asks.
  'export:queue:list': {
    input: z.object({}),
    output: z.object({ jobs: z.array(renderJobSchema) })
  },
  'export:start': {
    input: z
      .object({
        projectFolder: z.string().trim().min(1),
        shortIds: z.array(z.string().min(1)).min(1).max(MAX_EXPORT_SHORTS)
      })
      .refine((input) => new Set(input.shortIds).size === input.shortIds.length, {
        message: 'A short can be in an export only once.'
      }),
    output: z.object({ jobs: z.array(renderJobSchema) })
  },
  'export:cancel': {
    input: z.object({ jobId: z.string().min(1) }),
    output: z.object({ cancelled: z.boolean() })
  },
  // Opens Explorer on the export's file once it is finished, or on its folder before that.
  'export:reveal': {
    input: z.object({ jobId: z.string().min(1) }),
    output: z.object({ revealed: z.literal(true) })
  },
  // Reads a media file's streams with ffprobe. Runs as a probe job, ahead of other media jobs.
  'media:probe': {
    input: z.object({ path: z.string().trim().min(1) }),
    output: probeResultSchema
  },
  // Every job the queue still holds: queued, running, and recently finished.
  'media:job:list': {
    input: z.object({}),
    output: z.object({ jobs: z.array(jobSnapshotSchema) })
  },
  'media:job:cancel': {
    input: z.object({ jobId: z.string().min(1) }),
    output: z.object({ cancelled: z.boolean() })
  },
  // Starts a batch: one analysis stage over each item, run on the media queue. Returns the saved batch.
  'batch:run': {
    input: z
      .object({
        projectFolder: z.string().trim().min(1),
        stage: analysisStageSchema,
        items: z.array(analysisItemSchema).min(1).max(MAX_BATCH_ITEMS)
      })
      .refine((input) => new Set(input.items.map((item) => item.id)).size === input.items.length, {
        message: 'A media item can be in a batch only once.'
      }),
    output: z.object({ batch: batchSchema })
  },
  // Cancels one queued or running item of a batch.
  'batch:cancel': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      batchId: z.string().min(1),
      itemId: z.string().min(1)
    }),
    output: z.object({ cancelled: z.boolean(), batch: batchSchema })
  },
  // Runs again the given items that failed or were cancelled. Other items are skipped.
  'batch:retry': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      batchId: z.string().min(1),
      items: z.array(analysisItemSchema).min(1).max(MAX_BATCH_ITEMS)
    }),
    output: z.object({ retried: z.array(z.string()), batch: batchSchema })
  },
  // Native multi-select file dialog for importing media. Empty when the user cancels.
  'media:pick': {
    input: z.object({}),
    output: z.object({ paths: z.array(z.string().min(1)) })
  },
  // Queues any missing thumbnails and filmstrip for media items. Items with a cache already on disk
  // are left alone, so calling this again after the cache is cleared rebuilds it.
  'media:thumbs': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      items: z
        .array(
          z.object({
            id: z.string().min(1),
            path: z.string().min(1),
            kind: mediaKindSchema,
            durationSec: z.number().positive().optional()
          })
        )
        .max(500)
    }),
    output: z.object({
      queued: z.number().int().nonnegative(),
      cached: z.number().int().nonnegative(),
      waiting: z.number().int().nonnegative()
    })
  },
  // Reads one cached thumbnail, filmstrip or waveform as a data URL. dataUrl is null when the cache
  // has no such file yet, for example while the thumbs job is still running.
  'media:thumb:read': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/),
      file: z.enum(THUMB_READ_FILES)
    }),
    output: z.object({ dataUrl: z.string().nullable() })
  },
  // Queues the poster frame of each short that has no cached frame yet. Each item names the frame and
  // the footage file it comes from, so main can render it without reading the project.
  'media:posters': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      items: z
        .array(
          posterFrameRefSchema.extend({
            path: z.string().trim().min(1),
            pathKind: pathKindSchema
          })
        )
        .max(200)
    }),
    output: z.object({
      queued: z.number().int().nonnegative(),
      cached: z.number().int().nonnegative()
    })
  },
  // Reads one short's cached poster frame as a data URL. dataUrl is null while the frame is not
  // rendered yet.
  'media:poster:read': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      frame: posterFrameRefSchema
    }),
    output: z.object({ dataUrl: z.string().nullable() })
  },
  // Queues a 720p proxy for each video that needs one and has no file on disk. Items that do not
  // need one are skipped; the renderer sends the probe's video info so main can decide.
  'media:proxy': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      items: z
        .array(
          z.object({
            id: z.string().min(1),
            path: z.string().min(1),
            kind: mediaKindSchema,
            sizeBytes: z.number().int().nonnegative(),
            durationSec: z.number().positive().optional(),
            video: z.object({ width: z.number(), height: z.number(), codec: z.string() }).optional()
          })
        )
        .max(500)
    }),
    output: z.object({
      queued: z.number().int().nonnegative(),
      cached: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative()
    })
  },
  // Checks each media item's original and proxy on disk, and records their paths in main so the media
  // protocol can serve them. The renderer gets flags only, never paths.
  'media:sources': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      media: z.array(mediaSourceRefSchema).max(500)
    }),
    output: z.object({ sources: z.array(mediaSourceInfoSchema) })
  },
  // Reads the name and size of each path. Paths that are not files come back in missing.
  'media:stat': {
    input: z.object({ paths: z.array(z.string().trim().min(1)).min(1).max(500) }),
    output: z.object({
      files: z.array(importCandidateSchema),
      missing: z.array(z.string())
    })
  },
  // Makes sure every media item in the project has an analysis record, and queues pending stages when
  // the project analyzes automatically. Stages a restart interrupted go back to pending.
  'analysis:sync': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      items: z.array(analysisItemSchema).max(2000)
    }),
    output: z.object({ file: analysisFileSchema })
  },
  // Turns the project's "Analyze automatically" toggle on or off.
  'analysis:setAuto': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      enabled: z.boolean(),
      items: z.array(analysisItemSchema).max(2000)
    }),
    output: z.object({ file: analysisFileSchema })
  },
  // Starts one media item over from its first analysis stage.
  'analysis:reanalyze': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      item: analysisItemSchema
    }),
    output: z.object({ file: analysisFileSchema })
  },
  // The user's answer to the cost question before a project's first vision pass. Confirm starts the
  // vision stages that were waiting; skip marks them skipped for this project.
  'analysis:visionDecision': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      decision: visionDecisionSchema
    }),
    output: z.object({ file: analysisFileSchema })
  },
  // One media item's cached transcript, or null when it has none yet (not analyzed, or cache cleared).
  'analysis:transcript:read': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/)
    }),
    output: z.object({ transcript: transcriptSchema.nullable() })
  },
  // Makes sure each media item has a transcript, transcribing the ones that do not yet. An item whose
  // transcription fails comes back with a null transcript. Used by caption generation.
  'captions:transcribe': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      items: z.array(analysisItemSchema).max(500)
    }),
    output: z.object({
      transcripts: z.array(
        z.object({
          mediaId: z.string().min(1),
          transcript: transcriptSchema.nullable()
        })
      )
    })
  },
  // Saves a short's captions as an SRT file. The renderer builds the text (src/shared/captions/srt.ts)
  // and main shows the save dialog and writes it. Null savedPath means the user cancelled.
  'captions:exportSrt': {
    input: z.object({
      suggestedName: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((name) => !/[\\/]/.test(name), { message: 'A file name cannot hold a folder.' }),
      srt: z.string().max(2_000_000)
    }),
    output: z.object({ savedPath: z.string().min(1).nullable() })
  },
  // One media item's vision descriptions, one per described shot. Empty until the vision stage has run
  // for it. The search index reads them to find shots by what is on screen.
  'analysis:vision:read': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/)
    }),
    output: z.object({
      shots: z.array(visionShotSchema.pick({ shotIndex: true, description: true, tags: true }))
    })
  },
  // One clip's AI suggestions: tags from its analysis and the moments found by the last search, minus the
  // ones the user dismissed. Reads only; it sends nothing to the API.
  'analysis:suggestions:read': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/)
    }),
    output: suggestionsOutputSchema
  },
  // Asks Claude for candidate moments of one clip. Costs a request, so only the user starts it.
  'analysis:suggestions:findMoments': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/),
      fileName: z.string().trim().min(1).max(260),
      durationMs: z.number().nonnegative().optional()
    }),
    output: suggestionsOutputSchema
  },
  // Dismisses suggestions by key. Dismissed suggestions do not come back on re-analysis.
  'analysis:suggestions:dismiss': {
    input: z.object({
      projectFolder: z.string().trim().min(1),
      mediaId: z.string().regex(/^[A-Za-z0-9_-]+$/),
      keys: z.array(z.string().min(1).max(200)).min(1).max(200)
    }),
    output: suggestionsOutputSchema
  },
  // Tells main that playback started or stopped. Analysis pauses while playback runs.
  'analysis:playback': {
    input: z.object({ playing: z.boolean() }),
    output: z.object({ playing: z.boolean() })
  },
  // Cloud AI status: settings, whether a key is saved, and this month's usage. Never the key itself.
  'ai:status': {
    input: z.object({}),
    output: aiStatusSchema
  },
  'ai:settings:update': {
    input: z.object({
      visionModel: visionModelSchema.optional(),
      monthlySpendCapUsd: z.number().positive().max(MAX_CAP_USD).nullable().optional()
    }),
    output: aiStatusSchema
  },
  // Saves the key encrypted with the OS keychain. The reply is status only, never the key.
  'ai:key:save': {
    input: z.object({ apiKey: z.string().trim().min(20).max(300).regex(/^\S+$/) }),
    output: aiStatusSchema
  },
  'ai:key:clear': {
    input: z.object({}),
    output: aiStatusSchema
  },
  // One small request with the saved key. Its token usage is recorded like any other request.
  'ai:key:test': {
    input: z.object({}),
    output: z.object({ ok: z.boolean(), message: z.string() })
  },
  // Estimated cost of a vision pass over a number of shots, against the cap.
  'ai:vision:estimate': {
    input: z.object({ shotCount: z.number().int().nonnegative().max(100000) }),
    output: visionEstimateSchema
  },
  // What one script run would cost and which footage it would use. Sends nothing to the API.
  'ai:scripts:estimate': {
    input: scriptRunInputSchema,
    output: scriptEstimateSchema
  },
  // Drafts scripts from the request and the project's footage. The reply is drafts only; the renderer
  // saves them through a project command, so they can be undone.
  'ai:scripts:generate': {
    input: scriptRunInputSchema,
    output: z.object({ scripts: z.array(generatedScriptSchema).min(1) })
  },
  // Matches each script line to footage from the search index. The reply is a plan the renderer shows for
  // review; it reaches the timeline only when the user applies it through a project command.
  'ai:footage:match': {
    input: footageMatchRequestSchema,
    output: footageMatchResultSchema
  },
  // Rewrites one line. The reply is text only; the renderer shows it as a suggestion and saves it
  // through a project command when the user accepts it.
  'ai:scripts:rewriteLine': {
    input: lineRewriteInputSchema,
    output: lineRewriteOutputSchema
  }
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>

export type IpcChannelName = keyof typeof ipcChannels
export const ipcChannelNames = Object.keys(ipcChannels) as IpcChannelName[]

export function isIpcChannel(name: unknown): name is IpcChannelName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ipcChannels, name)
}

export type IpcInput<C extends IpcChannelName> = z.input<(typeof ipcChannels)[C]['input']>
export type IpcOutput<C extends IpcChannelName> = z.output<(typeof ipcChannels)[C]['output']>

// Events main pushes to the renderer. One entry per event, with the payload schema. The preload
// bridge checks each payload before the renderer sees it.
export const ipcEvents = {
  'app:error': { payload: appErrorSchema },
  // Sent whenever a media job changes status or progress.
  'media:job:changed': { payload: jobSnapshotSchema },
  // Sent whenever a batch changes: an item's status, its progress, or the batch itself.
  'batch:changed': {
    payload: z.object({ projectFolder: z.string().min(1), batch: batchSchema })
  },
  // Sent whenever a project's analysis records change.
  'analysis:changed': {
    payload: z.object({ projectFolder: z.string().min(1), file: analysisFileSchema })
  },
  // Sent whenever the AI settings, key state or monthly usage change.
  'ai:changed': { payload: z.object({ status: aiStatusSchema }) },
  // Sent whenever an export in the render queue changes status or progress.
  'export:queue:changed': { payload: z.object({ jobs: z.array(renderJobSchema) }) },
  // Sent when an export finished and its short is recorded as Exported in the project on disk.
  'export:shortExported': {
    payload: z.object({
      projectFolder: z.string().min(1),
      shortId: z.string().min(1),
      exportedAt: z.string().min(1)
    })
  }
} satisfies Record<string, { payload: z.ZodType }>

export type IpcEventName = keyof typeof ipcEvents
export const ipcEventNames = Object.keys(ipcEvents) as IpcEventName[]

export function isIpcEvent(name: unknown): name is IpcEventName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ipcEvents, name)
}

export type IpcEventPayload<E extends IpcEventName> = z.output<(typeof ipcEvents)[E]['payload']>
export type IpcEventListener<E extends IpcEventName> = (payload: IpcEventPayload<E>) => void
export type Unsubscribe = () => void

// What the renderer sees on window.api. invoke takes a request and returns a result; on subscribes
// to a main-process event and returns a function that stops listening.
export type IpcInvoke = <C extends IpcChannelName>(
  channel: C,
  input: IpcInput<C>
) => Promise<IpcResult<IpcOutput<C>>>

export type IpcSubscribe = <E extends IpcEventName>(
  event: E,
  listener: IpcEventListener<E>
) => Unsubscribe

export interface RendererInvokeApi {
  invoke: IpcInvoke
}

export interface RendererApi extends RendererInvokeApi {
  on: IpcSubscribe
}
