// Error reports shared by main and renderer. A report has a plain-language headline and hint for the
// toast, and a technical detail for the Details dialog. Stack traces never go in the detail: they go
// to the log file, so the user sees what happened and a developer can still find where.
import { z } from 'zod'

export const appErrorSourceSchema = z.enum(['main', 'renderer'])
export type AppErrorSource = z.infer<typeof appErrorSourceSchema>

export const appErrorSchema = z.object({
  id: z.string().min(1).max(64),
  source: appErrorSourceSchema,
  // Plain language, one short sentence. Safe to show in a toast.
  message: z.string().min(1).max(300),
  // Technical detail for the copyable Details view. Never a stack trace.
  details: z.string().max(2000),
  occurredAt: z.iso.datetime()
})
export type AppError = z.infer<typeof appErrorSchema>

// Shown under every unexpected error. Plain words, no jargon.
export const UNEXPECTED_ERROR_HINT = 'Try again. If it keeps happening, copy the details.'

export const UNEXPECTED_ERROR_MESSAGES: Record<AppErrorSource, string> = {
  main: 'The app hit an unexpected problem.',
  renderer: 'Part of the screen hit an unexpected problem.'
}

const MAX_DETAIL_LENGTH = 2000

// One line of technical detail: the error's name and message, with no stack trace.
export function describeError(error: unknown): string {
  let text: string
  if (error instanceof Error) {
    text = error.message ? `${error.name}: ${error.message}` : error.name
  } else if (typeof error === 'string') {
    text = error
  } else {
    text = `Non-error value: ${safeStringify(error)}`
  }
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH - 1)}…` : text
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export function createAppError(
  source: AppErrorSource,
  error: unknown,
  options: { id: string; occurredAt: Date }
): AppError {
  return {
    id: options.id,
    source,
    message: UNEXPECTED_ERROR_MESSAGES[source],
    details: describeError(error),
    occurredAt: options.occurredAt.toISOString()
  }
}
