// Writes error entries to one log sink. The default sink is the console; the app points it at a log
// file in the user's logs folder once Electron is ready. Kept free of Electron imports for tests.
export type ErrorLogSink = (text: string) => void

let sink: ErrorLogSink = (text) => console.error(text)

export function setErrorLogSink(next: ErrorLogSink): void {
  sink = next
}

export interface ErrorLogEntry {
  occurredAt: string
  source: 'main' | 'renderer'
  // The technical summary, one line. Never shown to the user directly.
  summary: string
  // Context such as the pane or channel that failed. Optional.
  context?: string
  // Full stack trace, for developers. Only the log gets it.
  stack?: string
}

export function formatErrorLogEntry(entry: ErrorLogEntry): string {
  const head = `${entry.occurredAt} [${entry.source}]${entry.context ? ` (${entry.context})` : ''} ${entry.summary}`
  return entry.stack ? `${head}\n${entry.stack}` : head
}

export function logError(entry: ErrorLogEntry): void {
  sink(formatErrorLogEntry(entry))
}
