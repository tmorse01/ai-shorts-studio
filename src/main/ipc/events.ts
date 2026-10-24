import { BrowserWindow } from 'electron'
import { ipcEvents, type IpcEventName, type IpcEventPayload } from '@shared/ipc'

// Sends an event to every open window. The payload is checked against the event's schema first, so
// a bad payload is dropped here rather than reaching the renderer.
export function emitIpcEvent<E extends IpcEventName>(event: E, payload: IpcEventPayload<E>): void {
  const checked = ipcEvents[event].payload.safeParse(payload)
  if (!checked.success) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(event, checked.data)
    }
  }
}
