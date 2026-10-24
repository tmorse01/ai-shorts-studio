import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Toast, ToastProvider } from '@renderer/ui/Toast'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { getRendererApi, reportRendererError } from '../errors/reportRendererError'
import { toast } from './toast'
import { toastStore, type ToastItem } from './toastStore'
import { installRendererErrorHandlers, toastInputForAppError } from './globalErrors'
import styles from './ToastHost.module.css'

let rendererErrorSequence = 0
const newRendererErrorId = (): string =>
  `renderer-${Date.now().toString(36)}-${++rendererErrorSequence}`

// Mount once, next to the app. Renders every toast and the Details dialog, and listens for errors
// from the renderer and from main.
export function ToastHost() {
  const toasts = useStore(toastStore, (state) => state.toasts)
  const [details, setDetails] = useState<ToastItem | null>(null)

  useEffect(() => {
    const stopRendererErrors = installRendererErrorHandlers(window, {
      notify: (input) => {
        toast.error(input)
      },
      report: (error) => reportRendererError(error),
      newId: newRendererErrorId,
      now: () => new Date()
    })
    const stopMainErrors = getRendererApi()?.on('app:error', (error) => {
      toast.error(toastInputForAppError(error))
    })
    return () => {
      stopRendererErrors()
      stopMainErrors?.()
    }
  }, [])

  return (
    <>
      <ToastProvider>
        {toasts.map((item) => (
          <Toast
            key={item.id}
            open
            onOpenChange={(open) => {
              if (!open) toast.dismiss(item.id)
            }}
            tone={item.tone}
            title={item.title}
            description={item.description}
            duration={item.dismissAfterMs ?? Infinity}
            action={
              item.details ? (
                <Button variant="ghost" size="sm" onClick={() => setDetails(item)}>
                  Details
                </Button>
              ) : undefined
            }
          />
        ))}
      </ToastProvider>
      <Dialog
        open={details !== null}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
        title={details?.title ?? ''}
        description="Technical detail for support. Copy it and send it with a bug report."
        footer={details && <CopyDetailsButton text={details.details ?? ''} />}
      >
        {details?.details && <pre className={styles.detail}>{details.details}</pre>}
      </Dialog>
    </>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

function CopyDetailsButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      {state === 'failed' && (
        <span className={styles.status} role="status">
          Copy failed. Select the text and copy it by hand.
        </span>
      )}
      <Button variant="secondary" onClick={() => void copy()}>
        {state === 'copied' ? 'Copied' : 'Copy details'}
      </Button>
    </>
  )
}
