// Pure dispatch logic for IPC requests. No Electron imports here, so it can be tested directly.
import {
  ipcChannels,
  ipcFailure,
  isIpcChannel,
  type IpcChannelName,
  type IpcInput,
  type IpcOutput,
  type IpcResult
} from '@shared/ipc'
import { UserFacingError } from '../errors'

export type IpcHandler<C extends IpcChannelName> = (
  input: IpcInput<C>
) => IpcOutput<C> | Promise<IpcOutput<C>>

export type IpcHandlers = { [C in IpcChannelName]: IpcHandler<C> }

// Validates the request, runs the handler, validates the response, and turns every failure into a
// typed error result. Nothing thrown inside main crosses the IPC boundary as a raw string.
export async function dispatchIpc<C extends IpcChannelName>(
  channel: C,
  raw: unknown,
  handler: IpcHandler<C>
): Promise<IpcResult<IpcOutput<C>>> {
  const { input, output } = ipcChannels[channel]

  const request = input.safeParse(raw)
  if (!request.success) {
    return ipcFailure(
      'VALIDATION_FAILED',
      `The request to ${channel} was not valid.`,
      request.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ')
    )
  }

  try {
    const result = await handler(request.data as IpcInput<C>)
    const response = output.safeParse(result)
    if (!response.success) {
      return ipcFailure('HANDLER_FAILED', `${channel} returned an unexpected result.`)
    }
    return { ok: true, data: response.data as IpcOutput<C> }
  } catch (error) {
    if (error instanceof UserFacingError) {
      return ipcFailure('HANDLER_FAILED', error.message, error.details)
    }
    return ipcFailure(
      'HANDLER_FAILED',
      `${channel} failed.`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

// Routes a raw request from the renderer to its handler. Used by the Electron registration and by
// tests, so both take the same path.
export function routeIpc(
  handlers: IpcHandlers,
  channel: unknown,
  raw: unknown
): Promise<IpcResult<unknown>> {
  if (!isIpcChannel(channel)) {
    return Promise.resolve(ipcFailure('UNKNOWN_CHANNEL', 'That request is not a known channel.'))
  }
  // Each handler is typed for its own channel. Here the channel is only known at runtime, so the
  // lookup is widened to a union of handlers; dispatchIpc validates the input for the real channel.
  const handler = handlers[channel] as IpcHandler<IpcChannelName>
  return dispatchIpc(channel, raw, handler) as Promise<IpcResult<unknown>>
}
