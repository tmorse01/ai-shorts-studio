// The Media tool panel: the project's footage as a grid of fixed-size tiles or a sortable list, with
// search, filters and tags. Selection, sort, view and filter live in mediaPanelStore; the footage and its
// tags live in projectStore. Tag edits run as project commands, so they can be undone.
import { useState, type DragEvent, type JSX, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import {
  ChevronDown,
  ChevronRight,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreHorizontal,
  Music,
  Settings2,
  Trash2,
  Upload
} from 'lucide-react'
import type { MediaRef } from '@shared/project/schema'
import { clipPayload, DRAG_MIME, encodeDragPayload } from '@shared/timeline/dragPayload'
import { mediaUsageIndex, shortCountForMedia, usedInLabel } from '@shared/timeline/mediaUsage'
import { Button } from '@renderer/ui/Button'
import { Dialog } from '@renderer/ui/Dialog'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { IconButton } from '@renderer/ui/IconButton'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { applyProjectCommand } from '../shorts/shortActions'
import { analysisStore } from '../analysis/analysisStore'
import { cancelAnalysis, reanalyzeMedia, setAnalyzeAutomatically } from '../analysis/analysisSync'
import { AnalysisPanel } from '../analysis/AnalysisPanel'
import { analysisJobFor } from '../analysis/analysisProgress'
import { analysisErrorText, analysisStatusLabel } from '../analysis/analysisStatus'
import { projectStore } from '../project/projectStore'
import { sourceStore } from '../source/sourceStore'
import { MomentRows } from '../moments/MomentRows'
import { momentsOfMedia } from '../moments/momentView'
import { pickAndImportMedia } from './importMedia'
import { LoadedMediaTile } from './MediaTile'
import { tileStatus } from './mediaTileModel'
import { MediaFilterBar } from './MediaFilterBar'
import { MediaTagsDialog } from './MediaTagsDialog'
import { mediaPanelStore, type MediaViewMode } from './mediaPanelStore'
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

export interface MediaPanelProps {
  /** Project home already shows an import control above the grid, so it turns this off. */
  showImport?: boolean
}

export function MediaPanel({ showImport = true }: MediaPanelProps = {}): JSX.Element {
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
  // Clips whose saved moments are shown under them. Moments start collapsed.
  const [openMomentIds, setOpenMomentIds] = useState<string[]>([])
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const analysisFile = useStore(analysisStore, (state) =>
    current ? state.filesByFolder[current.folderPath] : undefined
  )
  const analysisJobs = useStore(analysisStore, (state) => state.jobs)

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

  const folderPath = current.folderPath
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

  const toggleMoments = (id: string) =>
    setOpenMomentIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]))

  // The shared click and drag behaviour of a clip, for the grid tile and the list row.
  const itemProps = (ref: MediaRef) => ({
    // Only footage with a known length drags as a clip. Stills have none.
    draggable: ref.durationMs !== undefined,
    onClick: (event: MouseEvent<HTMLButtonElement>) => onItemClick(ref.id, event),
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      if (ref.durationMs === undefined) return
      event.dataTransfer.setData(DRAG_MIME, encodeDragPayload(clipPayload(ref.id, ref.durationMs)))
      event.dataTransfer.effectAllowed = 'copy'
    }
  })

  // One grid tile: a fixed-size card with its thumbnail, name, status, badges and moments.
  const renderTile = (ref: MediaRef) => {
    const record = analysisFile?.records[ref.id]
    const status = tileStatus(record, analysisJobFor(analysisJobs, ref.fileName))
    const moments = momentsOfMedia(current.project.moments, ref.id)
    const showMoments = moments.length > 0 && openMomentIds.includes(ref.id)
    return (
      <LoadedMediaTile
        key={ref.id}
        folderPath={folderPath}
        mediaId={ref.id}
        kind={ref.kind}
        fileName={ref.fileName}
        durationMs={ref.durationMs}
        tagNames={tagsOfMedia(ref, current.project).map((tag) => tag.name)}
        selected={selectedIds.includes(ref.id)}
        status={status}
        shortCount={shortCountForMedia(usage, ref.id)}
        momentCount={moments.length}
        momentsOpen={showMoments}
        onToggleMoments={() => toggleMoments(ref.id)}
        onRetry={
          status.kind === 'failed'
            ? () => void reanalyzeMedia(window.api, folderPath, ref)
            : undefined
        }
        itemProps={itemProps(ref)}
        momentRows={showMoments ? <MomentRows moments={moments} project={current.project} /> : null}
      />
    )
  }

  // One list row: the compact view of the same file, with the file's details on one line each.
  const renderRow = (ref: MediaRef) => {
    const Icon = KIND_ICON[ref.kind]
    const isSelected = selectedIds.includes(ref.id)
    const record = analysisFile?.records[ref.id]
    const errorText = record ? analysisErrorText(record) : undefined
    const moments = momentsOfMedia(current.project.moments, ref.id)
    const showMoments = moments.length > 0 && openMomentIds.includes(ref.id)
    const chips = tagsOfMedia(ref, current.project)
    return (
      <div key={ref.id} className={styles.cell} data-expanded={showMoments ? 'true' : undefined}>
        <button
          type="button"
          aria-pressed={isSelected}
          className={`${styles.item} ${isSelected ? styles.selected : ''}`}
          title="Drag onto the timeline"
          {...itemProps(ref)}
        >
          <span className={styles.kind}>
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className={styles.name}>{ref.fileName}</span>
          {chips.length > 0 ? (
            <span className={styles.chips}>
              {chips.map((tag) => (
                <span key={tag.id} className={styles.chip}>
                  {tag.name}
                </span>
              ))}
            </span>
          ) : null}
          <span className={styles.meta}>{formatDuration(ref.durationMs)}</span>
          <span className={styles.meta}>{formatBytes(ref.sizeBytes)}</span>
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
            onClick={() => toggleMoments(ref.id)}
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

  const toggleView = () =>
    mediaPanelStore.getState().setView(folderPath, activeView === 'grid' ? 'list' : 'grid')
  const toggleAutoAnalyze = () =>
    void setAnalyzeAutomatically(window.api, folderPath, !autoAnalyze, current.project.media)
  const reanalyzeSelected = () =>
    selectedRef && void reanalyzeMedia(window.api, folderPath, selectedRef)

  return (
    <div className={styles.panel}>
      <AnalysisPanel
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        sources={selectedRef ? [selectedRef] : current.project.media}
        file={analysisFile}
        jobs={analysisJobs}
        onCancel={(ref) => void cancelAnalysis(window.api, folderPath, ref)}
        onRetry={(ref) => void reanalyzeMedia(window.api, folderPath, ref)}
      />
      <div className={styles.toolbar}>
        {showImport ? (
          <Button variant="primary" size="sm" onClick={() => void pickAndImportMedia()}>
            <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
            Import
          </Button>
        ) : null}
        <div className={styles.inline}>
          <IconButton
            icon={activeView === 'grid' ? List : LayoutGrid}
            label={activeView === 'grid' ? 'Show as list' : 'Show as grid'}
            onClick={toggleView}
          />
          <label className={styles.autoToggle}>
            <input type="checkbox" checked={autoAnalyze} onChange={toggleAutoAnalyze} />
            Analyze automatically
          </label>
          <Button variant="ghost" size="sm" disabled={!selectedRef} onClick={reanalyzeSelected}>
            Re-analyze
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnalysisOpen(true)}>
            Analysis
          </Button>
        </div>
        {/* Shown instead of the three controls above when the toolbar is narrow (see the CSS). */}
        <div className={styles.overflow}>
          <DropdownMenu
            trigger={<IconButton icon={MoreHorizontal} label="More media actions" />}
            items={[
              {
                label: activeView === 'grid' ? 'Show as list' : 'Show as grid',
                onSelect: toggleView
              },
              {
                label: 'Analyze automatically',
                detail: autoAnalyze ? 'On' : 'Off',
                onSelect: toggleAutoAnalyze
              },
              {
                label: 'Re-analyze',
                disabled: !selectedRef,
                onSelect: reanalyzeSelected
              }
            ]}
          />
        </div>
        <span className={styles.spacer} />
        <IconButton icon={Settings2} label="Manage tags" onClick={() => setTagsOpen(true)} />
        <IconButton
          icon={Trash2}
          label="Remove from project"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      <MediaFilterBar folderPath={folderPath} filter={filter} tags={tags} />

      {selectedIds.length > 0 ? (
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

      {activeView === 'list' ? (
        <div className={styles.header} role="presentation">
          {sortButton('name', 'Name')}
          {sortButton('duration', 'Duration')}
          {sortButton('size', 'Size')}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className={styles.empty}>No files match the search and filters.</p>
      ) : (
        <div className={activeView === 'grid' ? styles.grid : styles.list}>
          {activeView === 'grid' ? items.map(renderTile) : items.map(renderRow)}
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
