// Builds the object exposed to the renderer. It takes the raw transport as a parameter so the same
// code runs in the preload (over ipcRenderer) and in tests (over the main-process router).
import {
  ipcChannels,
  ipcFailure,
  ipcResultSchema,
  isIpcChannel,
  type IpcChannelName,
  type IpcInput,
  type IpcOutput,
  type IpcResult,
  type RendererApi
} from '@shared/ipc'

export type RawInvoke = (channel: string, input: unknown) => Promise<unknown>

export function createBridge(rawInvoke: RawInvoke): RendererApi {
  return {
    invoke: async <C extends IpcChannelName>(
      channel: C,
      input: IpcInput<C>
    ): Promise<IpcResult<IpcOutput<C>>> => {
      if (!isIpcChannel(channel)) {
        return ipcFailure('UNKNOWN_CHANNEL', 'That request is not a known channel.')
      }

      let raw: unknown
      try {
        raw = await rawInvoke(channel, input)
      } catch {
        return ipcFailure('TRANSPORT_FAILED', 'The app did not answer the request.')
      }

      // Check the reply against the channel's schema, so the renderer never sees an unexpected shape.
      const response = ipcResultSchema(ipcChannels[channel].output).safeParse(raw)
      if (!response.success) {
        return ipcFailure('INVALID_RESPONSE', `The app sent an unexpected reply to ${channel}.`)
      }
      return response.data as IpcResult<IpcOutput<C>>
    }
  }
}
