import { useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { Short, ShortStatus } from '@shared/project/schema'
import { effectiveShortSettings } from '@shared/shorts/shortSettings'
import { Button } from '@renderer/ui/Button'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { Select } from '@renderer/ui/Select'
import { toast } from '../toasts/toast'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand, undoProjectEdit } from './shortActions'
import {
  createShortCommand,
  deleteShortCommand,
  duplicateShortCommand,
  renameShortCommand,
  reorderShortCommand,
  setShortStatusCommand,
  type ManualShortStatus
} from './shortCommands'
import { ShortCard } from './ShortCard'
import { filterShorts, SORT_OPTIONS, sortShorts, STATUS_FILTERS, type SortMode } from './shortsView'
import { nextCardIndex } from './shortsGridNav'
import styles from './ShortsGrid.module.css'

const NO_SHORTS: Short[] = []

// The Shorts section of Project home: a grid of poster cards, with sort and status filters. Cards
// can be reordered by dragging (Manual sort only) or with Alt+Left and Alt+Right.
export function ShortsGrid(): JSX.Element | null {
  const shorts = useProjectStore((state) => state.current?.project.shorts ?? NO_SHORTS)
  const defaults = useProjectStore((state) => state.current?.project.defaults)
  const projectId = useProjectStore((state) => state.current?.project.id)
  const router = useRouter()
  const gridRef = useRef<HTMLDivElement>(null)
  const draggedIdRef = useRef<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('manual')
  const [statuses, setStatuses] = useState<ShortStatus[]>([])

  if (!defaults || !projectId) return null

  const targetMax = (short: Short) =>
    effectiveShortSettings(defaults, short.overrides).targetLength.maxSec
  const visible = filterShorts(sortShorts(shorts, sortMode, targetMax), statuses)
  const dragEnabled = sortMode === 'manual'
  const now = () => new Date().toISOString()

  function openShort(shortId: string) {
    if (!projectId) return
    void router.navigate({
      to: '/project/$projectId/short/$shortId',
      params: { projectId, shortId }
    })
  }

  function newShort() {
    const shortId = crypto.randomUUID()
    applyProjectCommand(createShortCommand(shortId, now()))
    openShort(shortId)
  }

  function duplicate(shortId: string) {
    applyProjectCommand(duplicateShortCommand(shortId, crypto.randomUUID(), now()))
  }

  function setStatus(shortId: string, status: ManualShortStatus) {
    applyProjectCommand(setShortStatusCommand(shortId, status, now()))
  }

  function remove(short: Short) {
    applyProjectCommand(deleteShortCommand(short.id))
    toast.info({
      title: `Deleted ${short.name}`,
      action: { label: 'Undo', run: () => undoProjectEdit() }
    })
  }

  function moveTo(shortId: string, toIndex: number) {
    applyProjectCommand(reorderShortCommand(shortId, toIndex))
  }

  // Alt+Left and Alt+Right move a card one place in the posting order.
  function move(shortId: string, delta: number) {
    const index = shorts.findIndex((short) => short.id === shortId)
    if (index === -1) return
    const target = Math.min(Math.max(index + delta, 0), shorts.length - 1)
    if (target !== index) moveTo(shortId, target)
  }

  // Drop puts the dragged card where the target card sits in the posting order.
  function dropOn(targetId: string) {
    const fromId = draggedIdRef.current
    draggedIdRef.current = null
    if (!fromId || fromId === targetId) return
    moveTo(
      fromId,
      shorts.findIndex((short) => short.id === targetId)
    )
  }

  function commitRename(short: Short, name: string) {
    setRenamingId(null)
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === short.name) return
    applyProjectCommand(renameShortCommand(short.id, trimmed, now()))
  }

  function toggleStatus(status: ShortStatus) {
    setStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    )
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey) return
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
        <div className={styles.filters}>
          <Select
            aria-label="Sort shorts"
            options={SORT_OPTIONS}
            value={sortMode}
            onValueChange={(value) => setSortMode(value as SortMode)}
          />
          {STATUS_FILTERS.map((filter) => {
            const pressed = statuses.includes(filter.value)
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={pressed}
                className={pressed ? styles.chipOn : styles.chip}
                onClick={() => toggleStatus(filter.value)}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
        <Button variant="primary" onClick={newShort}>
          New short
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className={styles.none}>No shorts match these filters.</p>
      ) : (
        <div ref={gridRef} className={styles.grid} onKeyDown={onGridKeyDown}>
          {visible.map((short) => (
            <ShortCard
              key={short.id}
              short={short}
              target={effectiveShortSettings(defaults, short.overrides)}
              renaming={renamingId === short.id}
              draggable={dragEnabled}
              onOpen={() => openShort(short.id)}
              onStartRename={() => setRenamingId(short.id)}
              onCommitRename={(name) => commitRename(short, name)}
              onCancelRename={() => setRenamingId(null)}
              onDuplicate={() => duplicate(short.id)}
              onSetStatus={(status) => setStatus(short.id, status)}
              onDelete={() => remove(short)}
              onMove={(delta) => move(short.id, delta)}
              onDragStart={() => {
                draggedIdRef.current = short.id
              }}
              onDropHere={() => dropOn(short.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
