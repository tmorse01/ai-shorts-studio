import type { ReactNode } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import styles from './Toast.module.css'

/** Wrap the app once. Toasts render into the viewport at the bottom right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider swipeDirection="right" duration={6000}>
      {children}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  )
}

export interface ToastProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Errors get a destructive edge so they stand out from plain status messages. */
  tone?: 'default' | 'error'
}

export function Toast({ open, onOpenChange, title, description, tone = 'default' }: ToastProps) {
  const className = tone === 'error' ? `${styles.root} ${styles.error}` : styles.root
  return (
    <RadixToast.Root className={className} open={open} onOpenChange={onOpenChange}>
      <div className={styles.text}>
        <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>
        {description && (
          <RadixToast.Description className={styles.description}>
            {description}
          </RadixToast.Description>
        )}
      </div>
      <RadixToast.Close className={styles.close} aria-label="Dismiss">
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </RadixToast.Close>
    </RadixToast.Root>
  )
}
