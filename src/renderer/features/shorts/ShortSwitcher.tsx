import type { JSX } from 'react'
import { useParams, useRouter } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import type { Short } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { useProjectStore } from '../project/useProjectStore'
import { projectStore } from '../project/projectStore'
import { toast } from '../toasts/toast'
import { applyProjectCommand } from './shortActions'
import { createShortCommand } from './shortCommands'
import { switcherEntries, switchToShort } from './shortSwitch'

const NO_SHORTS: Short[] = []

// Editor toolbar control: the open short's name, with a list of every short in grid order and a
// New short entry. Choosing a short saves pending edits first, then opens it.
export function ShortSwitcher(): JSX.Element | null {
  const { projectId, shortId } = useParams({ strict: false })
  const shorts = useProjectStore((state) => state.current?.project.shorts ?? NO_SHORTS)
  const router = useRouter()

  if (!projectId || !shortId) return null

  const current = shorts.find((short) => short.id === shortId)

  // An arrow function, so the narrowing of projectId and shortId above carries into it.
  const openShort = (nextId: string) => {
    void switchToShort(shortId, nextId, {
      flush: () => projectStore.getState().flush(),
      hasSaveError: () => projectStore.getState().saveStatus.kind === 'error',
      navigate: (id) =>
        void router.navigate({
          to: '/project/$projectId/short/$shortId',
          params: { projectId, shortId: id }
        }),
      onSaveFailed: () =>
        toast.error({
          title: 'Could not switch shorts',
          description: 'Your latest changes are not saved yet. Fix the save, then try again.'
        })
    })
  }

  function newShort() {
    const id = crypto.randomUUID()
    applyProjectCommand(createShortCommand(id, new Date().toISOString()))
    openShort(id)
  }

  const items = [
    ...switcherEntries(shorts).map((entry) => ({
      label: entry.name,
      detail: entry.statusLabel,
      onSelect: () => openShort(entry.id)
    })),
    { label: 'New short', onSelect: newShort }
  ]

  return (
    <DropdownMenu
      align="start"
      items={items}
      trigger={
        <Button variant="ghost" size="sm" aria-label="Switch short">
          {current?.name ?? 'Short'}
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      }
    />
  )
}
