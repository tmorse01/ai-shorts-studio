// Uncaught errors and unhandled promise rejections in the renderer, and app errors that main sends
// over the app:error event. Each one becomes an error toast. Renderer errors are also logged.
import { createAppError, UNEXPECTED_ERROR_HINT, type AppError } from '@shared/errors'
import type { ToastInput } from './toast'

export function toastInputForAppError(error: AppError): ToastInput {
  return { title: error.message, description: UNEXPECTED_ERROR_HINT, details: error.details }
}

export interface RendererErrorDeps {
  notify: (input: ToastInput) => void
  report: (error: unknown) => void
  newId: () => string
  now: () => Date
}

export function handleRendererError(raw: unknown, deps: RendererErrorDeps): void {
  const error = createAppError('renderer', raw, { id: deps.newId(), occurredAt: deps.now() })
  deps.report(raw)
  deps.notify(toastInputForAppError(error))
}

// Listens on the window for uncaught errors and unhandled rejections. Returns the function that
// removes both listeners.
export function installRendererErrorHandlers(
  target: EventTarget,
  deps: RendererErrorDeps
): () => void {
  // The fields of ErrorEvent and PromiseRejectionEvent that matter here. Typed locally so this file
  // needs no DOM typings.
  const onError = (event: Event): void => {
    const { error, message } = event as Event & { error?: unknown; message?: string }
    handleRendererError(error ?? message, deps)
  }
  const onRejection = (event: Event): void => {
    handleRendererError((event as Event & { reason?: unknown }).reason, deps)
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
