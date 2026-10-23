import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styles from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** While true the dialog cannot be dismissed, e.g. while a save is in flight. */
  busy?: boolean
  children: ReactNode
  footer?: ReactNode
  /** Wide suits content that needs room, such as a diagram. Defaults to a narrow form-sized dialog. */
  size?: 'default' | 'wide'
}

/**
 * Shared frame for the app's modal dialogs: a title, an optional description, a scrolling body and an
 * optional footer. Radix supplies focus trapping and Escape handling.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  busy = false,
  children,
  footer,
  size = 'default'
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <Dialog.Portal>
        {/* modal-backdrop is the marker App's keyboard shortcuts check before handling Space and arrows. */}
        <Dialog.Overlay className={`${styles.overlay} modal-backdrop`} />
        <Dialog.Content
          className={size === 'wide' ? `${styles.content} ${styles.wide}` : styles.content}
        >
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Description className={description ? styles.description : styles.hidden}>
            {description ?? title}
          </Dialog.Description>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
