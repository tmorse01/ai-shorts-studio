// The IPC contract shared by main, preload and renderer. Every channel is defined once here with a
// zod schema for its request and its response. Main validates requests and responses with these
// schemas; the preload bridge checks responses too, so a drifted main process fails loudly.
import { z } from 'zod'
import { uiLayoutSchema } from './layout'
import { projectSchema } from './project/schema'

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
  // Plain-language warning for a toast, for example when the project was recovered from its backup.
  warning: z.string().optional()
})

export const ipcChannels = {
  'app:echo': {
    input: z.object({ text: z.string().trim().min(1).max(200) }),
    output: z.object({ text: z.string(), length: z.number().int().nonnegative() })
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

// What the renderer sees on window.api. One typed method; the channel name picks the schema.
export type IpcInvoke = <C extends IpcChannelName>(
  channel: C,
  input: IpcInput<C>
) => Promise<IpcResult<IpcOutput<C>>>

export interface RendererApi {
  invoke: IpcInvoke
}
