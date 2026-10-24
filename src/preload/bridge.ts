// Builds the object exposed to the renderer. It takes the raw transport as a parameter so the same
// code runs in the preload (over ipcRenderer) and in tests (over the main-process router).
import {
  ipcChannels,
  ipcEvents,
  ipcFailure,
  ipcResultSchema,
  isIpcChannel,
  isIpcEvent,
  type IpcChannelName,
  type IpcEventListener,
  type IpcEventName,
  type IpcInput,
  type IpcOutput,
  type IpcResult,
  type IpcSubscribe,
  type RendererInvokeApi,
  type Unsubscribe
} from '@shared/ipc'

export type RawInvoke = (channel: string, input: unknown) => Promise<unknown>

export function createBridge(rawInvoke: RawInvoke): RendererInvokeApi {
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

export type RawSubscribe = (channel: string, listener: (payload: unknown) => void) => Unsubscribe

// Subscribes a renderer listener to a main-process event. Payloads that fail the event's schema are
// dropped, so a listener only ever sees a valid payload.
export function createEventBridge(rawSubscribe: RawSubscribe): IpcSubscribe {
  return <E extends IpcEventName>(event: E, listener: IpcEventListener<E>): Unsubscribe => {
    if (!isIpcEvent(event)) return () => undefined
    return rawSubscribe(event, (raw) => {
      const payload = ipcEvents[event].payload.safeParse(raw)
      if (payload.success) listener(payload.data as Parameters<IpcEventListener<E>>[0])
    })
  }
}
