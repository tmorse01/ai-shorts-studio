import { ipcMain } from 'electron'
import { ipcChannelNames } from '@shared/ipc'
import { routeIpc, type IpcHandlers } from './dispatch'

export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const channel of ipcChannelNames) {
    ipcMain.handle(channel, (_event, raw: unknown) => routeIpc(handlers, channel, raw))
  }
}
