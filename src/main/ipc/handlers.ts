import type { IpcHandlers } from './dispatch'
import { logError } from '../errors/errorLog'

// The main-process implementation of every channel. Input is already validated when a handler runs.
export const ipcHandlers: IpcHandlers = {
  'app:echo': ({ text }) => ({ text, length: text.length }),
  'app:report-error': ({ message, details, context, stack }) => {
    logError({
      occurredAt: new Date().toISOString(),
      source: 'renderer',
      summary: details ? `${message} (${details})` : message,
      context,
      stack
    })
    return { logged: true }
  }
}
