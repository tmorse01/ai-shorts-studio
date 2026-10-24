import { app } from 'electron'
import { appendFile, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { emitIpcEvent } from '../ipc/events'
import { setErrorLogSink } from './errorLog'
import { installMainErrorHandlers } from './mainErrors'

// Call once, after app is ready. Errors go to the console and to errors.log in the logs folder, and
// each one is sent to the open windows as an app:error event.
export function setupErrorReporting(): void {
  const logsDir = app.getPath('logs')
  mkdirSync(logsDir, { recursive: true })
  const logFile = join(logsDir, 'errors.log')

  setErrorLogSink((text) => {
    console.error(text)
    appendFile(logFile, `${text}\n`, () => undefined)
  })

  installMainErrorHandlers({
    notify: (error) => emitIpcEvent('app:error', error)
  })
}
