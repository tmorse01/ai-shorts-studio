// Catches uncaught exceptions and unhandled rejections in the main process. Each one is logged with
// its stack trace and passed on as an app error, which the window shows as an error toast.
import { createAppError, type AppError } from '@shared/errors'
import { logError } from './errorLog'

export interface MainErrorDeps {
  // Delivers a report to the renderer (the app sends it as the app:error event).
  notify: (error: AppError) => void
  now?: () => Date
  newId?: () => string
}

let nextId = 0
const defaultNewId = (): string => `main-${Date.now().toString(36)}-${++nextId}`

// Returns the handler for one error. Exported so tests can call it without process events.
export function createMainErrorHandler(deps: MainErrorDeps): (error: unknown) => AppError {
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? defaultNewId
  return (error: unknown) => {
    const report = createAppError('main', error, { id: newId(), occurredAt: now() })
    logError({
      occurredAt: report.occurredAt,
      source: 'main',
      summary: report.details,
      stack: error instanceof Error ? error.stack : undefined
    })
    deps.notify(report)
    return report
  }
}

// Wires the handler to the process. Call once, at startup.
export function installMainErrorHandlers(deps: MainErrorDeps): void {
  const handle = createMainErrorHandler(deps)
  process.on('uncaughtException', (error) => {
    handle(error)
  })
  process.on('unhandledRejection', (reason) => {
    handle(reason)
  })
}
