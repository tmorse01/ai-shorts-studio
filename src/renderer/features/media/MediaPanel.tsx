// The Media tool panel: the project's footage as a grid of cards or a sortable list, with search,
// filters and tags. Selection, sort, view and filter live in mediaPanelStore; the footage and its tags
// live in projectStore. Tag edits run as project commands, so they can be undone.
import { useState, type JSX, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import {
  ChevronDown,
  ChevronRight,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Settings2,
  Trash2
} from 'lucide-react'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { IconButton } from '@renderer/ui/IconButton'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { applyProjectCommand } from '../shorts/shortActions'
import { analysisStore } from '../analysis/analysisStore'
import { reanalyzeMedia, setAnalyzeAutomatically } from '../analysis/analysisSync'
import { analysisErrorText, analysisStatusLabel } from '../analysis/analysisStatus'
import { projectStore } from '../project/projectStore'
import { pickAndImportMedia } from './importMedia'
import { MediaFilterBar } from './MediaFilterBar'
import { MediaTagsDialog } from './MediaTagsDialog'
import { mediaPanelStore, type MediaViewMode } from './mediaPanelStore'
import { sourceStore } from '../source/sourceStore'
import { MomentRows } from '../moments/MomentRows'
import { MomentSearch } from '../search/MomentSearch'
import { momentsOfMedia } from '../moments/momentView'
import { clipPayload, DRAG_MIME, encodeDragPayload } from '@shared/timeline/dragPayload'
import { mediaUsageIndex, shortCountForMedia, usedInLabel } from '@shared/timeline/mediaUsage'
import { allMediaTags, setMediaTagCommand, tagCoverage, tagsOfMedia } from './mediaTags'
import {
  EMPTY_MEDIA_FILTER,
  filterMedia,
  formatDuration,
  removeMediaCommand,
  sortMedia,
  type MediaSortKey
} from './mediaView'
import styles from './MediaPanel.module.css'

const KIND_ICON = { video: Film, audio: Music, image: ImageIcon } as const

export function MediaPanel(): JSX.Element {
  const current = useStore(projectStore, (state) => state.current)
  const view = useStore(mediaPanelStore, (state) =>
    current ? state.viewByProject[current.folderPath] : undefined
  )
  const filter = useStore(mediaPanelStore, (state) =>
    current ? (state.filterByProject[current.folderPath] ?? EMPTY_MEDIA_FILTER) : EMPTY_MEDIA_FILTER
  )
  const sortKey = useStore(mediaPanelStore, (state) => state.sortKey)
  const sortDirection = useStore(mediaPanelStore, (state) => state.sortDirection)
  const selection = useStore(mediaPanelStore, (state) => state.selection)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  // The footage search text. While it is set, the panel shows ranked results instead of the grid.
  const [searchText, setSearchText] = useState('')
  // Clips whose saved moments are shown under them. Moments start collapsed.
  const [openMomentIds, setOpenMomentIds] = useState<string[]>([])
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
  const tags = allMediaTags(current.project)
  // Which shorts use each file, from their timelines. The card badges and drag payloads read this.
  const usage = mediaUsageIndex(current.project.shorts)
  const items = sortMedia(filterMedia(current.project.media, filter), sortKey, sortDirection)
  const order = items.map((ref) => ref.id)
  // Only files on screen count as selected, so a tag or remove never reaches a hidden file.
  const selectedIds = selection.ids.filter((id) => order.includes(id))
  // Until main reports the project's analysis file, analysis counts as on.
  const autoAnalyze = analysisFile?.autoAnalyze ?? true
  const selectedRef =
    selectedIds.length === 1
      ? current.project.media.find((ref) => ref.id === selectedIds[0])
      : undefined

  const onItemClick = (id: string, event: MouseEvent) => {
    mediaPanelStore
      .getState()
      .select(id, { additive: event.ctrlKey || event.metaKey, range: event.shiftKey }, order)
    // A plain click on a video opens it in the centre pane's Source view.
    const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey
    if (plain && current?.project.media.find((ref) => ref.id === id)?.kind === 'video') {
      sourceStore.getState().openSource(id)
    }
  }

  const removeSelected = () => {
    const ids = [...selectedIds]
    projectStore.getState().edit((draft) => removeMediaCommand(ids).produce(draft))
    mediaPanelStore.getState().clearSelection()
    setConfirmOpen(false)
  }

  // Adds the tag to every selected file, or removes it from all of them when all already have it.
  const toggleTagOnSelection = (tagId: string) => {
    const coverage = tagCoverage(current.project.media, selectedIds, tagId)
    applyProjectCommand(setMediaTagCommand(selectedIds, tagId, coverage !== 'all'))
  }

  const renderTags = (ref: MediaRef) => {
    const chips = tagsOfMedia(ref, current.project)
    if (chips.length === 0) return null
    return (
      <span className={styles.chips}>
        {chips.map((tag) => (
          <span key={tag.id} className={styles.chip}>
            {tag.name}
          </span>
        ))}
      </span>
    )
  }

  const renderRow = (ref: MediaRef) => {
    const Icon = KIND_ICON[ref.kind]
    const isSelected = selectedIds.includes(ref.id)
    const record = analysisFile?.records[ref.id]
    const errorText = record ? analysisErrorText(record) : undefined
    const moments = momentsOfMedia(current.project.moments, ref.id)
    const showMoments = moments.length > 0 && openMomentIds.includes(ref.id)
    const toggleMoments = () =>
      setOpenMomentIds((ids) =>
        ids.includes(ref.id) ? ids.filter((id) => id !== ref.id) : [...ids, ref.id]
      )
    return (
      <div key={ref.id} className={styles.cell} data-expanded={showMoments ? 'true' : undefined}>
        <button
          type="button"
          aria-pressed={isSelected}
          className={`${styles.item} ${isSelected ? styles.selected : ''}`}
          // Only footage with a known length drags as a clip. Stills have none.
          draggable={ref.durationMs !== undefined}
          title="Drag onto the timeline"
          onClick={(event) => onItemClick(ref.id, event)}
          onDragStart={(event) => {
            if (ref.durationMs === undefined) return
            event.dataTransfer.setData(
              DRAG_MIME,
              encodeDragPayload(clipPayload(ref.id, ref.durationMs))
            )
            event.dataTransfer.effectAllowed = 'copy'
          }}
        >
          <span className={styles.kind}>
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className={styles.name}>{ref.fileName}</span>
          {renderTags(ref)}
          <span className={styles.meta}>{formatDuration(ref.durationMs)}</span>
          {activeView === 'list' ? (
            <span className={styles.meta}>{formatBytes(ref.sizeBytes)}</span>
          ) : null}
          {ref.useProxy ? <span className={styles.badge}>Proxy</span> : null}
          {shortCountForMedia(usage, ref.id) > 0 ? (
            <span className={styles.usage}>{usedInLabel(shortCountForMedia(usage, ref.id))}</span>
          ) : null}
          {record ? (
            <span className={styles.analysisStatus}>{analysisStatusLabel(record)}</span>
          ) : null}
          {errorText ? (
            <span className={styles.analysisError} title={errorText}>
              {errorText}
            </span>
          ) : null}
        </button>
        {moments.length > 0 ? (
          <button
            type="button"
            className={styles.momentToggle}
            aria-expanded={showMoments}
            onClick={toggleMoments}
          >
            {showMoments ? (
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronRight size={12} strokeWidth={1.75} aria-hidden="true" />
            )}
            {moments.length === 1 ? '1 moment' : `${moments.length} moments`}
          </button>
        ) : null}
        {showMoments ? <MomentRows moments={moments} project={current.project} /> : null}
      </div>
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
        <IconButton icon={Settings2} label="Manage tags" onClick={() => setTagsOpen(true)} />
        <IconButton
          icon={Trash2}
          label="Remove from project"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      <MomentSearch
        folderPath={current.folderPath}
        project={current.project}
        query={searchText}
        onQueryChange={setSearchText}
      />

      {searchText.trim() === '' ? (
        <MediaFilterBar folderPath={current.folderPath} filter={filter} tags={tags} />
      ) : null}

      {selectedIds.length > 0 && searchText.trim() === '' ? (
        <div className={styles.tagBar} role="group" aria-label="Tag selected files">
          <span className={styles.tagBarLabel}>
            {selectedIds.length === 1 ? '1 selected' : `${selectedIds.length} selected`}
          </span>
          {tags.map((tag) => {
            const coverage = tagCoverage(current.project.media, selectedIds, tag.id)
            return (
              <button
                type="button"
                key={tag.id}
                aria-pressed={coverage === 'all'}
                data-coverage={coverage}
                className={`${styles.chip} ${coverage !== 'none' ? styles.chipOn : ''}`}
                onClick={() => toggleTagOnSelection(tag.id)}
              >
                {coverage === 'some' ? `${tag.name} (some)` : tag.name}
              </button>
            )
          })}
        </div>
      ) : null}

      {searchText.trim() === '' && activeView === 'list' ? (
        <div className={styles.header} role="presentation">
          {sortButton('name', 'Name')}
          {sortButton('duration', 'Duration')}
          {sortButton('size', 'Size')}
        </div>
      ) : null}

      {searchText.trim() !== '' ? null : items.length === 0 ? (
        <p className={styles.empty}>No files match the search and filters.</p>
      ) : (
        <div className={activeView === 'grid' ? styles.grid : styles.list}>
          {items.map(renderRow)}
        </div>
      )}

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

      <MediaTagsDialog open={tagsOpen} onOpenChange={setTagsOpen} project={current.project} />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
