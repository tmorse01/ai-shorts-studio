// The IPC contract shared by main, preload and renderer. Every channel is defined once here with a
// zod schema for its request and its response. Main validates requests and responses with these
// schemas; the preload bridge checks responses too, so a drifted main process fails loudly.
import { z } from 'zod'
import { appErrorSchema } from './errors'
import { uiLayoutSchema } from './layout'
import { projectSchema } from './project/schema'
import { recentProjectSchema } from './project/recentProjects'

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
  'app:error': { payload: appErrorSchema }
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
