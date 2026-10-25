import { useRef, type JSX, type KeyboardEvent } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { Short, ShortDefaults, ShortStatus } from '@shared/project/schema'
import { DropdownMenu, type DropdownMenuItem } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { Input } from '@renderer/ui/Input'
import { Button } from '@renderer/ui/Button'
import type { ManualShortStatus } from './shortCommands'
import { isShortEmpty } from './shortsView'
import styles from './ShortCard.module.css'

export interface ShortCardProps {
  short: Short
  // Effective settings: the project defaults with this short's overrides applied.
  target: ShortDefaults
  // The short's poster frame as a data URL. Undefined shows the placeholder ornament.
  posterSrc?: string
  renaming: boolean
  onOpen: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onDuplicate: () => void
  onSetStatus: (status: ManualShortStatus) => void
  onDelete: () => void
  // Batch drafts only (#148): keep the draft, or run footage matching again when `onRegenerate` is set.
  onKeep: () => void
  onRegenerate?: () => void
  // Dragging and Alt+Arrow reordering are on in Manual sort only.
  draggable: boolean
  onMove: (delta: number) => void
  onDragStart: () => void
  onDropHere: () => void
}

const STATUS_LABEL: Record<ShortStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  exported: 'Exported'
}

// One short as a 9:16 poster card. Double-click or Enter opens it, F2 renames it.
export function ShortCard({
  short,
  target,
  posterSrc,
  renaming,
  onOpen,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicate,
  onSetStatus,
  onDelete,
  onKeep,
  onRegenerate,
  draggable,
  onMove,
  onDragStart,
  onDropHere
}: ShortCardProps): JSX.Element {
  // Set once a rename has ended by Enter or Escape, so the blur that follows does not commit again.
  const settledRef = useRef(false)
  const items: DropdownMenuItem[] = [
    { label: 'Open', onSelect: onOpen },
    { label: 'Rename', onSelect: onStartRename },
    { label: 'Duplicate', onSelect: onDuplicate }
  ]
  if (short.status !== 'exported') {
    const nextStatus: ManualShortStatus = short.status === 'ready' ? 'draft' : 'ready'
    items.push({
      label: nextStatus === 'ready' ? 'Mark Ready' : 'Mark Draft',
      onSelect: () => onSetStatus(nextStatus)
    })
  }
  items.push({ label: 'Delete', onSelect: onDelete, destructive: true })

  function startRename() {
    settledRef.current = false
    onStartRename()
  }

  function onPosterKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter') onOpen()
    if (event.key === 'F2') startRename()
    if (event.key === 'Delete') onDelete()
    if (draggable && event.altKey && event.key === 'ArrowLeft') onMove(-1)
    if (draggable && event.altKey && event.key === 'ArrowRight') onMove(1)
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      settledRef.current = true
      onCommitRename(event.currentTarget.value)
    }
    if (event.key === 'Escape') {
      settledRef.current = true
      onCancelRename()
    }
  }

  return (
    <article
      className={styles.card}
      data-short-card
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', short.id)
        onDragStart()
      }}
      onDragOver={(event) => {
        if (draggable) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDropHere()
      }}
    >
      <button
        type="button"
        data-short-open
        className={styles.poster}
        aria-label={`Open ${short.name}`}
        onDoubleClick={onOpen}
        onKeyDown={onPosterKeyDown}
      >
        {posterSrc ? (
          // The name sits under the card, so the poster is decorative for screen readers.
          <img className={styles.image} src={posterSrc} alt="" draggable={false} />
        ) : isShortEmpty(short) ? (
          <span className={styles.emptyFrame} data-empty="true">
            <span className={styles.ornament} aria-hidden="true" />
            <span className={styles.emptyText}>Empty · open to add clips</span>
          </span>
        ) : (
          <span className={styles.ornament} aria-hidden="true" />
        )}
        {short.editedSinceExport && (
          <span className={styles.dot} role="img" aria-label="Edited since export" />
        )}
      </button>

      <div className={styles.body}>
        {renaming ? (
          <Input
            aria-label="Short name"
            className={styles.nameInput}
            defaultValue={short.name}
            maxLength={120}
            autoFocus
            onKeyDown={onRenameKeyDown}
            onBlur={(event) => {
              if (!settledRef.current) onCommitRename(event.currentTarget.value)
            }}
          />
        ) : (
          <span className={styles.name}>{short.name}</span>
        )}
        <span className={styles.meta}>
          Target {target.targetLength.minSec}–{target.targetLength.maxSec} s
        </span>
        <span className={styles.chip} data-status={short.status}>
          {STATUS_LABEL[short.status]}
        </span>
        {short.batchDraft && (
          <div className={styles.review}>
            <span className={styles.draftBadge}>Batch draft</span>
            <div className={styles.reviewActions}>
              <Button size="sm" variant="primary" onClick={onKeep}>
                Keep
              </Button>
              {onRegenerate && (
                <Button size="sm" variant="ai" onClick={onRegenerate}>
                  Regenerate
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={onDelete}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.menu}>
        <DropdownMenu
          trigger={<IconButton icon={MoreHorizontal} label={`Actions for ${short.name}`} />}
          items={items}
        />
      </div>
    </article>
  )
}
