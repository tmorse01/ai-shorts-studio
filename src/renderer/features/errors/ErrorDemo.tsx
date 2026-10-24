import { useState } from 'react'
import { Button } from '@renderer/ui/Button'
import { PaneErrorBoundary } from './PaneErrorBoundary'

// Demo for the review page. It exercises each error path: an uncaught error, a rejected promise,
// and a pane that crashes while rendering inside its boundary. Renders as items in the caller's row.
export function ErrorDemo() {
  const [crash, setCrash] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setTimeout(() => {
            throw new Error('Demo: uncaught error from a timer')
          }, 0)
        }}
      >
        Throw uncaught error
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          void Promise.reject(new Error('Demo: a promise nobody handled'))
        }}
      >
        Reject a promise
      </Button>
      <PaneErrorBoundary name="Demo" onRetry={() => setCrash(false)}>
        <DemoPane crash={crash} onCrash={() => setCrash(true)} />
      </PaneErrorBoundary>
    </>
  )
}

function DemoPane({ crash, onCrash }: { crash: boolean; onCrash: () => void }) {
  if (crash) throw new Error('Demo: the pane failed while rendering')
  return (
    <Button variant="secondary" size="sm" onClick={onCrash}>
      Crash the demo pane
    </Button>
  )
}
