import * as Dialog from '@radix-ui/react-dialog'
import styles from './ConfirmDialog.module.css'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Branded confirmation for destructive actions. Replaces window.confirm, which cannot be styled. */
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Portal>
        {/* modal-backdrop is the marker App's keyboard shortcuts check before handling Space and arrows. */}
        <Dialog.Overlay className={`${styles.overlay} modal-backdrop`} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Description className={styles.description}>{description}</Dialog.Description>
          <div className={styles.actions}>
            <Dialog.Close asChild>
              <button type="button">Cancel</button>
            </Dialog.Close>
            <button type="button" className="danger" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
