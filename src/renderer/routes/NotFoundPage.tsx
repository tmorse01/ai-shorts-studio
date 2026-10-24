import type { JSX } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '../ui/Button'
import { RoutePlaceholder } from './RoutePlaceholder'

// Shown for any address that matches no route.
export function NotFoundPage(): JSX.Element {
  const router = useRouter()

  return (
    <RoutePlaceholder
      title="Page not found"
      tone="editorial"
      description="This address does not match any page in the studio."
      back={false}
      actions={
        <Button variant="primary" onClick={() => void router.navigate({ to: '/' })}>
          Go to projects
        </Button>
      }
    />
  )
}
