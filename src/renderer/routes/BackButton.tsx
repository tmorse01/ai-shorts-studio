import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/Button'

// Steps back through history. A deep link has no history to return to, so it goes to the dashboard.
export function BackButton() {
  const router = useRouter()
  const canGoBack = useCanGoBack()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (canGoBack) {
          router.history.back()
        } else {
          void router.navigate({ to: '/' })
        }
      }}
    >
      Back
    </Button>
  )
}
