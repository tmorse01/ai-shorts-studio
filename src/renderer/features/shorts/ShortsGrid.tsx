import { useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { Short } from '@shared/project/schema'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'
import { Button } from '@renderer/ui/Button'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { useProjectStore } from '../project/useProjectStore'
import { toast } from '../toasts/toast'
import { applyProjectCommand, undoProjectEdit } from './shortActions'
import {
  createShortCommand,
  deleteShortCommand,
  duplicateShortCommand,
  renameShortCommand,
  setShortStatusCommand,
  type ManualShortStatus
} from './shortCommands'
import { ShortCard } from './ShortCard'
import { nextCardIndex } from './shortsGridNav'
import styles from './ShortsGrid.module.css'

const NO_SHORTS: Short[] = []

// The Shorts section of Project home: a grid of poster cards, or an empty state with a call to
// action when the project has no shorts yet.
export function ShortsGrid(): JSX.Element | null {
  const shorts = useProjectStore((state) => state.current?.project.shorts ?? NO_SHORTS)
  const defaults = useProjectStore((state) => state.current?.project.defaults)
  const projectId = useProjectStore((state) => state.current?.project.id)
  const router = useRouter()
  const gridRef = useRef<HTMLDivElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  if (!defaults || !projectId) return null

  function openShort(shortId: string) {
    if (!projectId) return
    void router.navigate({
      to: '/project/$projectId/short/$shortId',
      params: { projectId, shortId }
    })
  }

  function newShort() {
    const shortId = crypto.randomUUID()
    applyProjectCommand(createShortCommand(shortId, new Date().toISOString()))
    openShort(shortId)
  }

  function duplicate(shortId: string) {
    applyProjectCommand(
      duplicateShortCommand(shortId, crypto.randomUUID(), new Date().toISOString())
    )
  }

  function setStatus(shortId: string, status: ManualShortStatus) {
    applyProjectCommand(setShortStatusCommand(shortId, status, new Date().toISOString()))
  }

  function remove(short: Short) {
    applyProjectCommand(deleteShortCommand(short.id))
    toast.info({
      title: `Deleted ${short.name}`,
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  function commitRename(short: Short, name: string) {
    setRenamingId(null)
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === short.name) return
    applyProjectCommand(renameShortCommand(short.id, trimmed, new Date().toISOString()))
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const cards = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-short-open]') ?? []
    )
    const index = cards.findIndex((card) => card === event.target)
    if (index === -1) return
    // The first card on a later row marks the column count.
    const rowTop = cards[0].getBoundingClientRect().top
    const firstOnNextRow = cards.findIndex((card) => card.getBoundingClientRect().top !== rowTop)
    const columns = firstOnNextRow === -1 ? cards.length : firstOnNextRow
    const target = nextCardIndex(event.key, index, cards.length, columns)
    if (target === null) return
    event.preventDefault()
    cards[target].focus()
  }

  if (shorts.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState
          title="No shorts yet"
          description="Make a short from the project defaults, then cut it in the editor."
        />
        <Button variant="primary" onClick={newShort}>
          New short
        </Button>
      </div>
    )
  }

  return (
    <section aria-label="Shorts" className={styles.section}>
      <div className={styles.toolbar}>
        <Button variant="primary" onClick={newShort}>
          New short
        </Button>
      </div>
      <div ref={gridRef} className={styles.grid} onKeyDown={onGridKeyDown}>
        {shorts.map((short) => (
          <ShortCard
            key={short.id}
            short={short}
            target={effectiveShortSettings(defaults, short.overrides)}
            renaming={renamingId === short.id}
            onOpen={() => openShort(short.id)}
            onStartRename={() => setRenamingId(short.id)}
            onCommitRename={(name) => commitRename(short, name)}
            onCancelRename={() => setRenamingId(null)}
            onDuplicate={() => duplicate(short.id)}
            onSetStatus={(status) => setStatus(short.id, status)}
            onDelete={() => remove(short)}
          />
        ))}
      </div>
    </section>
  )
}
