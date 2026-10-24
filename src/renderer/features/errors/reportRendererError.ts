import { describeError } from '@shared/errors'
import type { RendererApi } from '@shared/ipc'

// window.api only exists inside Electron, with the preload script. In a plain browser (the Vite dev
// page) it is missing, so every caller must cope with undefined. Read through globalThis, which is
// window in the renderer, so this module needs no DOM typings and the node tests can import it.
export function getRendererApi(): RendererApi | undefined {
  return (globalThis as { api?: RendererApi }).api
}

const MAX_STACK_LENGTH = 20000

// Logs a renderer error to the console and to the main process log file. Never throws, and never
// shows a toast: the caller decides what the user sees (the pane boundary shows an inline fallback).
export function reportRendererError(error: unknown, context?: string): void {
  const message = describeError(error) || 'Unknown error'
  const stack = error instanceof Error ? error.stack?.slice(0, MAX_STACK_LENGTH) : undefined
  console.error(`[renderer]${context ? ` (${context})` : ''} ${message}`, error)

  const api = getRendererApi()
  if (!api) return
  void api.invoke('app:report-error', {
    message,
    context: context?.slice(0, 200),
    stack
  })
}
