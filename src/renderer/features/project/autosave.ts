// Debounced autosave for one document. Each change restarts a short timer, and when it fires the
// latest value is written. Writes never overlap. A change made during a write is written after the
// debounce, not at once. A failed write keeps the value pending: the next change, retry or flush
// writes it again.
export const AUTOSAVE_DELAY_MS = 1000

export type SaveStatus =
  | { kind: 'saved'; savedAt: string | undefined }
  | { kind: 'saving' }
  | { kind: 'error'; message: string; details: string | undefined }

// Thrown by a save function to report a failure. The message is plain language, and details is
// technical text for the toast's details view. Never a stack trace.
export class SaveError extends Error {
  readonly details: string | undefined

  constructor(message: string, details?: string) {
    super(message)
    this.name = 'SaveError'
    this.details = details
  }
}

export interface AutosaveOptions<T> {
  save: (value: T) => Promise<void>
  onStatus: (status: SaveStatus) => void
  delayMs?: number
}

export interface Autosaver<T> {
  // Records a change. It is written once no change has arrived for delayMs.
  schedule: (value: T) => void
  // Writes pending changes now, and resolves when they are written or the write has failed.
  flush: () => Promise<void>
}

export function createAutosaver<T>({
  save,
  onStatus,
  delayMs = AUTOSAVE_DELAY_MS
}: AutosaveOptions<T>): Autosaver<T> {
  let latest: T | undefined
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined
  // Every write runs after the previous one, so a slow write never overlaps the next.
  let queue: Promise<void> = Promise.resolve()

  function cancelTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function run(): Promise<void> {
    queue = queue.then(async () => {
      cancelTimer()
      while (dirty && timer === undefined) {
        const value = latest as T
        dirty = false
        onStatus({ kind: 'saving' })
        try {
          await save(value)
        } catch (error) {
          dirty = true
          onStatus(describeFailure(error))
          return
        }
      }
      // A change scheduled during the last write keeps the status at saving until its timer runs.
      if (!dirty) onStatus({ kind: 'saved', savedAt: new Date().toISOString() })
    })
    return queue
  }

  return {
    schedule(value) {
      latest = value
      dirty = true
      onStatus({ kind: 'saving' })
      cancelTimer()
      timer = setTimeout(() => {
        timer = undefined
        void run()
      }, delayMs)
    },
    flush() {
      return run()
    }
  }
}

function describeFailure(error: unknown): SaveStatus {
  if (error instanceof SaveError) {
    return { kind: 'error', message: error.message, details: error.details }
  }
  return {
    kind: 'error',
    message: 'Your latest changes could not be saved.',
    details: error instanceof Error ? error.message : String(error)
  }
}
