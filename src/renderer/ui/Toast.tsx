import type { ReactNode } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { AlertTriangle, Check, Info, Sparkles, X, type LucideIcon } from 'lucide-react'
import styles from './Toast.module.css'

export type ToastTone = 'info' | 'success' | 'ai' | 'error'

/** Wrap the app once. Toasts render into the viewport at the bottom right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider swipeDirection="right" duration={5000}>
      {children}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  )
}

const toneIcons: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: Check,
  ai: Sparkles,
  error: AlertTriangle
}

export interface ToastProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** info (default), success (sage), ai (lavender) or error (muted red). Each has its own icon. */
  tone?: ToastTone
  /** Milliseconds before the toast closes itself. Infinity keeps it until dismissed. */
  duration?: number
  /** Extra control shown after the text, such as a Details button. */
  action?: ReactNode
}

export function Toast({
  open,
  onOpenChange,
  title,
  description,
  tone = 'info',
  duration,
  action
}: ToastProps) {
  const Icon = toneIcons[tone]
  return (
    <RadixToast.Root
      className={`${styles.root} ${styles[tone]}`}
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      // Errors are announced at once; other tones wait for the user to pause.
      type={tone === 'error' ? 'foreground' : 'background'}
    >
      <Icon className={styles.icon} size={16} strokeWidth={1.75} aria-hidden="true" />
      <div className={styles.text}>
        <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>
        {description && (
          <RadixToast.Description className={styles.description}>
            {description}
          </RadixToast.Description>
        )}
      </div>
      {action && <div className={styles.action}>{action}</div>}
      <RadixToast.Close className={styles.close} aria-label="Dismiss">
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </RadixToast.Close>
    </RadixToast.Root>
  )
}
