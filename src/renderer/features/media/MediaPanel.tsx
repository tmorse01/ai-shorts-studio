// The Media tool panel: the project's footage as a grid of cards or a sortable list. Selection, sort
// and view live in mediaPanelStore; the footage itself lives in projectStore.
import { useState, type JSX, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import { Film, Image as ImageIcon, LayoutGrid, List, Music, Trash2 } from 'lucide-react'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { IconButton } from '@renderer/ui/IconButton'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { analysisStore } from '../analysis/analysisStore'
import { reanalyzeMedia, setAnalyzeAutomatically } from '../analysis/analysisSync'
import { analysisErrorText, analysisStatusLabel } from '../analysis/analysisStatus'
import { projectStore } from '../project/projectStore'
import { pickAndImportMedia } from './importMedia'
import { mediaPanelStore, type MediaViewMode } from './mediaPanelStore'
import { formatDuration, removeMediaCommand, sortMedia, type MediaSortKey } from './mediaView'
import styles from './MediaPanel.module.css'

const KIND_ICON = { video: Film, audio: Music, image: ImageIcon } as const

export function MediaPanel(): JSX.Element {
  const current = useStore(projectStore, (state) => state.current)
  const view = useStore(mediaPanelStore, (state) =>
    current ? state.viewByProject[current.folderPath] : undefined
  )
  const sortKey = useStore(mediaPanelStore, (state) => state.sortKey)
  const sortDirection = useStore(mediaPanelStore, (state) => state.sortDirection)
  const selection = useStore(mediaPanelStore, (state) => state.selection)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const analysisFile = useStore(analysisStore, (state) =>
    current ? state.filesByFolder[current.folderPath] : undefined
  )

  if (!current) {
    return (
      <EmptyState title="No project open" description="Open a project to see its footage here." />
    )
  }
  if (current.project.media.length === 0) {
    return (
      <EmptyState
        title="No media yet"
        description="Drop video, audio or image files anywhere in the window, or use the Import button."
      />
    )
  }

  const activeView: MediaViewMode = view ?? 'grid'
  const items = sortMedia(current.project.media, sortKey, sortDirection)
  const order = items.map((ref) => ref.id)
  const selectedIds = selection.ids
  // Until main reports the project's analysis file, analysis counts as on.
  const autoAnalyze = analysisFile?.autoAnalyze ?? true
  const selectedRef =
    selectedIds.length === 1 ? items.find((ref) => ref.id === selectedIds[0]) : undefined

  const onItemClick = (id: string, event: MouseEvent) => {
    mediaPanelStore
      .getState()
      .select(id, { additive: event.ctrlKey || event.metaKey, range: event.shiftKey }, order)
  }

  const removeSelected = () => {
    const ids = [...selectedIds]
    projectStore.getState().edit((draft) => removeMediaCommand(ids).produce(draft))
    mediaPanelStore.getState().clearSelection()
    setConfirmOpen(false)
  }

  const renderRow = (ref: MediaRef) => {
    const Icon = KIND_ICON[ref.kind]
    const isSelected = selectedIds.includes(ref.id)
    const record = analysisFile?.records[ref.id]
    const errorText = record ? analysisErrorText(record) : undefined
    return (
      <button
        type="button"
        key={ref.id}
        aria-pressed={isSelected}
        className={`${styles.item} ${isSelected ? styles.selected : ''}`}
        onClick={(event) => onItemClick(ref.id, event)}
      >
        <span className={styles.kind}>
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className={styles.name}>{ref.fileName}</span>
        <span className={styles.meta}>{formatDuration(ref.durationMs)}</span>
        {activeView === 'list' ? (
          <span className={styles.meta}>{formatBytes(ref.sizeBytes)}</span>
        ) : null}
        {ref.useProxy ? <span className={styles.badge}>Proxy</span> : null}
        {record ? (
          <span className={styles.analysisStatus}>{analysisStatusLabel(record)}</span>
        ) : null}
        {errorText ? (
          <span className={styles.analysisError} title={errorText}>
            {errorText}
          </span>
        ) : null}
      </button>
    )
  }

  const sortButton = (key: MediaSortKey, label: string) => (
    <button
      type="button"
      className={styles.sort}
      aria-pressed={sortKey === key}
      onClick={() =>
        mediaPanelStore
          .getState()
          .setSort(key, sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc')
      }
    >
      {label}
      {sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <IconButton
          icon={activeView === 'grid' ? List : LayoutGrid}
          label={activeView === 'grid' ? 'Show as list' : 'Show as grid'}
          onClick={() =>
            mediaPanelStore
              .getState()
              .setView(current.folderPath, activeView === 'grid' ? 'list' : 'grid')
          }
        />
        <Button variant="ghost" size="sm" onClick={() => void pickAndImportMedia()}>
          Import
        </Button>
        <label className={styles.autoToggle}>
          <input
            type="checkbox"
            checked={autoAnalyze}
            onChange={(event) =>
              void setAnalyzeAutomatically(
                window.api,
                current.folderPath,
                event.target.checked,
                current.project.media
              )
            }
          />
          Analyze automatically
        </label>
        <Button
          variant="ghost"
          size="sm"
          disabled={!selectedRef}
          onClick={() =>
            selectedRef && void reanalyzeMedia(window.api, current.folderPath, selectedRef)
          }
        >
          Re-analyze
        </Button>
        <IconButton
          icon={Trash2}
          label="Remove from project"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      {activeView === 'list' ? (
        <div className={styles.header} role="presentation">
          {sortButton('name', 'Name')}
          {sortButton('duration', 'Duration')}
          {sortButton('size', 'Size')}
        </div>
      ) : null}

      <div className={activeView === 'grid' ? styles.grid : styles.list}>
        {items.map(renderRow)}
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${selectedIds.length === 1 ? '1 file' : `${selectedIds.length} files`} from the project?`}
        description="The files stay where they are on disk. They leave the project's media list and its undo history."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeSelected}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
