// The Clip Finder panel (left rail): one list of clip candidates for the selected video, hand-marked moments
// and AI suggestions together. AI suggestions are labelled "AI suggested" and stay open until accepted (they
// become normal moments) or dismissed. Footage search results also show here. Accepting, adding to the
// timeline and any other change are project commands, so each one can be undone.
import { useEffect, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import { recordSummary } from '@shared/analysis/analysis'
import type { MomentSuggestion, SuggestionsOutput } from '@shared/analysis/suggestions'
import { thumbFileName } from '@shared/media/thumbs'
import type { MediaRef, Project } from '@shared/project/schema'
import { momentPayload, rangePayload } from '@shared/timeline/dragPayload'
import { Button } from '@renderer/ui/Button'
import { Tabs } from '@renderer/ui/Tabs'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { editorHistory } from '../history/editorHistory'
import { analysisStore } from '../analysis/analysisStore'
import { reanalyzeMedia } from '../analysis/analysisSync'
import { mediaPanelStore } from '../media/mediaPanelStore'
import { allMediaTags } from '../media/mediaTags'
import { MomentSearch } from '../search/MomentSearch'
import { applyProjectCommand } from '../shorts/shortActions'
import { sourceStore } from '../source/sourceStore'
import { toast } from '../toasts/toast'
import { momentsOfMedia } from '../moments/momentView'
import { setMomentStarredCommand } from '../moments/momentCommands'
import { projectStore } from '../project/projectStore'
import { acceptSuggestionsCommand } from '../suggestions/suggestionCommands'
import { openSuggestions } from '../suggestions/suggestionView'
import { dismissSuggestions, findMoments, readSuggestions } from '../suggestions/suggestionSync'
import { ClipRow } from './ClipRow'
import { ClipSourceHeader } from './ClipSourceHeader'
import { DraftEditForm } from './DraftEditForm'
import { addToTimelineCommand } from './clipFinderCommands'
import {
  CLIP_FINDER_FILTERS,
  CLIP_FINDER_TABS,
  clipFinderItems,
  clipRowFacts,
  draftEditInputOf,
  isOpenSuggestion,
  visibleClipFinderItems,
  type ClipFinderFilter,
  type ClipFinderItem,
  type ClipFinderTab,
  type DraftEdit
} from './clipFinderModel'
import styles from './ClipFinderPanel.module.css'

export function ClipFinderPanel(): JSX.Element {
  const current = useStore(projectStore, (state) => state.current)
  const selection = useStore(mediaPanelStore, (state) => state.selection)
  const activeShortId = useStore(editorHistory.selection, (state) => state.activeId)
  const analysisFile = useStore(analysisStore, (state) =>
    current ? state.filesByFolder[current.folderPath] : undefined
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClipFinderFilter>('all')
  const [tab, setTab] = useState<ClipFinderTab>('suggested')
  const [data, setData] = useState<SuggestionsOutput | null>(null)
  const [busy, setBusy] = useState(false)
  // Edits to AI drafts, keyed by the draft's key, and the draft whose editor is open.
  const [draftEdits, setDraftEdits] = useState<ReadonlyMap<string, DraftEdit>>(() => new Map())
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const folderPath = current?.folderPath
  // The source is the one video selected in the Media panel.
  const source =
    current && selection.ids.length === 1
      ? current.project.media.find((ref) => ref.id === selection.ids[0])
      : undefined
  const sourceRef = source?.kind === 'video' ? source : undefined
  const sourceId = sourceRef?.id
  const record = sourceId ? analysisFile?.records[sourceId] : undefined
  const analysisState = record ? `${record.version}:${recordSummary(record)}` : 'none'

  useEffect(() => {
    let live = true
    setData(null)
    if (!folderPath || !sourceId) return
    void readSuggestions(window.api, folderPath, sourceId).then((next) => {
      if (live) setData(next)
    })
    return () => {
      live = false
    }
  }, [folderPath, sourceId, analysisState])

  if (!current || !folderPath) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to find clips in its footage."
      />
    )
  }

  const project: Project = current.project
  const searching = query.trim() !== ''

  // Runs one project command. A refused change shows as a toast and leaves the project as it was.
  const run = (command: Parameters<typeof applyProjectCommand>[0]): boolean => {
    try {
      applyProjectCommand(command)
      return true
    } catch (caught) {
      toast.error({
        title: 'The change could not be made',
        details: caught instanceof Error ? caught.message : undefined
      })
      return false
    }
  }

  // The open suggestions: what is not accepted or dismissed yet. Nothing is shown until they are read.
  const openItems = sourceRef && data ? openSuggestions(project, sourceRef.id, data) : undefined
  const tagNames = new Map(allMediaTags(project).map((tag) => [tag.id, tag.name]))
  const items: ClipFinderItem[] = sourceRef
    ? clipFinderItems({
        mediaId: sourceRef.id,
        moments: momentsOfMedia(project.moments, sourceRef.id),
        drafts: openItems?.moments ?? [],
        draftEdits,
        tagDrafts: openItems?.tags ?? [],
        tagNameOf: (id) => tagNames.get(id)
      })
    : []
  const shown = visibleClipFinderItems(items, filter, tab)

  const acceptDraft = async (item: Extract<ClipFinderItem, { kind: 'draft' }>) => {
    const moment: MomentSuggestion = {
      name: item.name,
      inMs: item.inMs,
      outMs: item.outMs,
      ...(item.note ? { note: item.note } : {}),
      ...(item.score === undefined ? {} : { score: item.score })
    }
    const saved = run(
      acceptSuggestionsCommand({
        mediaId: item.mediaId,
        tags: [],
        moments: [moment],
        newId: () => crypto.randomUUID()
      })
    )
    // An edited draft is saved from its new range, so the draft itself would still show as open. Dismiss it.
    if (saved && draftEdits.has(item.key)) {
      setBusy(true)
      const next = await dismissSuggestions(window.api, folderPath, item.mediaId, [item.key])
      setBusy(false)
      if (next) setData(next)
      setDraftEdits((previous) => {
        const remaining = new Map(previous)
        remaining.delete(item.key)
        return remaining
      })
    }
  }

  const acceptTag = (item: Extract<ClipFinderItem, { kind: 'tag' }>) => {
    run(
      acceptSuggestionsCommand({
        mediaId: item.mediaId,
        tags: [item.name],
        moments: [],
        newId: () => crypto.randomUUID()
      })
    )
  }

  const saveDraftEdit = (key: string, edit: DraftEdit) => {
    setDraftEdits((previous) => new Map(previous).set(key, edit))
    setEditingKey(null)
  }

  const dismiss = async (item: ClipFinderItem) => {
    setBusy(true)
    const next = await dismissSuggestions(window.api, folderPath, item.mediaId, [item.key])
    setBusy(false)
    if (next) setData(next)
  }

  const find = async (ref: MediaRef) => {
    setBusy(true)
    const next = await findMoments(window.api, folderPath, ref)
    setBusy(false)
    if (next) setData(next)
  }

  const preview = (item: ClipFinderItem) => {
    if (item.kind === 'tag') return
    sourceStore.getState().openRange(item.mediaId, item.inMs, item.outMs)
  }

  // Adds the range to the end of the short open in the editor. A saved moment keeps its id on the clip.
  const addToTimeline = (item: ClipFinderItem) => {
    if (item.kind === 'tag') return
    if (!activeShortId) {
      toast.info({
        title: 'Open a short first',
        description: 'Clips are added to the short open in the editor.'
      })
      return
    }
    const payload =
      item.kind === 'moment'
        ? momentPayload({
            id: item.momentId,
            mediaId: item.mediaId,
            inMs: item.inMs,
            outMs: item.outMs
          })
        : rangePayload(item.mediaId, item.inMs, item.outMs)
    run(
      addToTimelineCommand({
        shortId: activeShortId,
        payload,
        clipId: crypto.randomUUID(),
        now: new Date().toISOString()
      })
    )
  }

  const renderItem = (item: ClipFinderItem) => {
    const facts = clipRowFacts(item)
    const thumbFile = sourceRef ? thumbFileName(sourceRef.kind) : undefined
    const aiOpen = isOpenSuggestion(item)
    const actions =
      item.kind === 'tag' ? (
        <>
          <button
            type="button"
            className={styles.accent}
            disabled={busy}
            onClick={() => acceptTag(item)}
          >
            Accept
          </button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void dismiss(item)}>
            Dismiss
          </Button>
        </>
      ) : (
        <>
          {item.kind === 'draft' ? (
            <>
              <button
                type="button"
                className={styles.accent}
                disabled={busy}
                onClick={() => void acceptDraft(item)}
              >
                Accept
              </button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setEditingKey(item.key)}
              >
                Edit
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void dismiss(item)}>
                Dismiss
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => preview(item)}>
            Preview
          </Button>
          <button
            type="button"
            className={styles.addToTimeline}
            onClick={() => addToTimeline(item)}
          >
            Add to timeline
          </button>
        </>
      )
    return (
      <li key={item.key} className={styles.item}>
        <ClipRow
          projectFolder={folderPath}
          mediaId={item.mediaId}
          thumbFile={thumbFile}
          durationLabel={facts.durationLabel}
          title={item.name}
          summary={facts.summary}
          tags={item.kind === 'moment' ? item.tagNames : []}
          rangeLabel={facts.rangeLabel}
          scoreLabel={facts.scoreLabel}
          aiLabel={
            aiOpen
              ? 'AI suggested'
              : item.kind === 'moment' && item.createdBy === 'ai'
                ? 'AI'
                : undefined
          }
          onOpen={item.kind === 'tag' ? undefined : () => preview(item)}
          actions={actions}
          star={
            item.kind === 'moment'
              ? {
                  starred: item.starred,
                  onToggle: () => run(setMomentStarredCommand(item.momentId, !item.starred))
                }
              : undefined
          }
        />
        {item.kind === 'draft' && editingKey === item.key ? (
          <DraftEditForm
            initial={draftEditInputOf(item)}
            onSave={(edit) => saveDraftEdit(item.key, edit)}
            onCancel={() => setEditingKey(null)}
          />
        ) : null}
      </li>
    )
  }

  const list = (
    <ul className={styles.list} aria-label="Clip candidates">
      {shown.map(renderItem)}
      {shown.length === 0 ? (
        <li className={styles.empty}>
          {sourceRef
            ? 'No clips here yet. Find moments to have Claude read the transcript and shots.'
            : 'Select a video in Media to see its clip candidates.'}
        </li>
      ) : null}
    </ul>
  )

  return (
    <div className={styles.panel}>
      <MomentSearch
        folderPath={folderPath}
        project={project}
        query={query}
        onQueryChange={setQuery}
      />
      {searching ? null : (
        <>
          {sourceRef ? (
            <ClipSourceHeader
              key={sourceRef.id}
              folderPath={folderPath}
              source={sourceRef}
              busy={busy}
              onFind={() => void find(sourceRef)}
              onReanalyze={() => void reanalyzeMedia(window.api, folderPath, sourceRef)}
            />
          ) : null}
          <div className={styles.filter} role="group" aria-label="Filter clip candidates">
            {CLIP_FINDER_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                className={styles.filterButton}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Tabs
            aria-label="Clip candidate tabs"
            value={tab}
            onValueChange={(value) => setTab(value as ClipFinderTab)}
            items={CLIP_FINDER_TABS.map((option) => ({
              value: option.value,
              label: option.label,
              content: list
            }))}
          />
        </>
      )}
    </div>
  )
}
