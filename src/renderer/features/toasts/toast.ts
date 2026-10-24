// The toast service. Callable from anywhere in the renderer, with or without React:
//   toast.info({ title: 'Export queued' })
//   toast.error({ title: 'Export failed', description: 'Try again.', details: 'ENOSPC: disk full' })
// Info, success and AI toasts close after a few seconds. Error toasts stay until the user closes them.
import { toastStore, type ToastAction, type ToastItem, type ToastTone } from './toastStore'

export const AUTO_DISMISS_MS = 5000

export interface ToastInput {
  title: string
  description?: string
  details?: string
  action?: ToastAction
}

let sequence = 0

function show(tone: ToastTone, input: ToastInput): string {
  sequence += 1
  const id = `toast-${sequence}`
  const item: ToastItem = {
    id,
    tone,
    title: input.title,
    description: input.description,
    details: input.details,
    action: input.action,
    dismissAfterMs: tone === 'error' ? null : AUTO_DISMISS_MS
  }
  toastStore.getState().add(item)
  return id
}

export const toast = {
  /** Neutral status: something finished or changed. */
  info: (input: ToastInput): string => show('info', input),
  /** Something worked, in sage. */
  success: (input: ToastInput): string => show('success', input),
  /** Output from an AI tool, in lavender. */
  ai: (input: ToastInput): string => show('ai', input),
  /** Something failed. Stays until dismissed; pass details for the Details dialog. */
  error: (input: ToastInput): string => show('error', input),
  dismiss: (id: string): void => toastStore.getState().remove(id)
}
