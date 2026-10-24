// The transcript tab in the inspector, shown while the centre pane is in Source view. It lists the open
// clip's words, highlights the one under the playhead and keeps it in view while playback runs. A click
// on a word seeks there; a text selection sets In and Out to the words it covers.
import { memo, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import type { Transcript, TranscriptWord } from '@shared/analysis/transcript'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { analysisStore } from '@renderer/features/analysis/analysisStore'
import { playbackStore } from '@renderer/features/playback/playbackStore'
import { usePlaybackStore } from '@renderer/features/playback/usePlaybackStore'
import { projectStore } from '@renderer/features/project/projectStore'
import { sourceStore } from '@renderer/features/source/sourceStore'
import { Button } from '@renderer/ui/Button'
import { useTranscript } from './useTranscript'
import {
  currentWordIndex,
  deriveTranscriptState,
  transcriptLines,
  wordRangeFromIndices,
  type TranscriptLine
} from './transcriptView'
import styles from './TranscriptSection.module.css'

// A word this close to the list's edge counts as in view, so the list moves before the word is cut off.
const EDGE_PX = 16
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export function TranscriptSection(): JSX.Element {
  const sourceId = useStore(sourceStore, (state) => state.sourceId)
  const folderPath = useStore(projectStore, (state) => state.current?.folderPath)
  const analysisFile = useStore(analysisStore, (state) =>
    folderPath ? state.filesByFolder[folderPath] : undefined
  )
  const record = sourceId ? analysisFile?.records[sourceId] : undefined
  const status = record?.stages.transcript.status
  const errorMessage = record?.stages.transcript.error?.message
  // A new version or a new stage status reloads the transcript from disk.
  const loadKey = `${sourceId ?? ''}|${record?.version ?? 0}|${status ?? ''}`
  const loaded = useTranscript(folderPath, sourceId ?? undefined, status === 'done', loadKey)

  if (sourceId === null) {
    return <EmptyState title="No source open" description="Open a clip to read its transcript." />
  }

  const view = deriveTranscriptState({
    status,
    errorMessage,
    transcript: loaded.transcript,
    readError: loaded.readError
  })
  switch (view.kind) {
    case 'not-analyzed':
      return (
        <EmptyState
          title="Not analyzed yet"
          description="The transcript appears here once this clip has been analyzed."
        />
      )
    case 'loading':
      return <EmptyState title="Loading transcript" description="Reading the saved transcript." />
    case 'running':
      return (
        <EmptyState
          title="Transcribing"
          description="The transcript appears here when this clip finishes."
          accent="ai"
        />
      )
    case 'failed':
      return <EmptyState title="Transcript failed" description={view.message} />
    case 'no-speech':
      return <EmptyState title="No speech" description="This clip has no spoken words." />
    case 'ready':
      return <TranscriptBody transcript={view.transcript} />
  }
}

// Seeks the playhead to a word. The source viewer moves the video to match.
function seekToWord(word: TranscriptWord): void {
  if (!window.getSelection()?.isCollapsed) return
  playbackStore.getState().seek(word.startMs)
}

// The word index of the text node (or element) under a selection end, or null when it is outside the
// word list.
function wordIndexAt(node: Node | null, list: HTMLElement): number | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  const word = element?.closest<HTMLElement>('[data-word-index]')
  if (!word || !list.contains(word)) return null
  const index = Number(word.dataset.wordIndex)
  return Number.isInteger(index) ? index : null
}

// Sets In and Out to the words a text selection covers. A collapsed selection (a click) sets nothing.
function applySelectionRange(list: HTMLElement, words: readonly TranscriptWord[]): void {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  const anchor = wordIndexAt(selection.anchorNode, list)
  const focus = wordIndexAt(selection.focusNode, list)
  if (anchor === null || focus === null) return
  const range = wordRangeFromIndices(words, anchor, focus)
  if (range) sourceStore.getState().markRange(range.startMs, range.endMs)
}

function TranscriptBody({ transcript }: { transcript: Transcript }): JSX.Element {
  const playheadMs = usePlaybackStore((state) => state.playheadMs)
  const activeIndex = currentWordIndex(transcript.words, playheadMs)
  const lines = useMemo(() => transcriptLines(transcript), [transcript])
  const listRef = useRef<HTMLDivElement>(null)
  // Auto-scroll follows the playhead until the user scrolls the list. Follow resumes from the button.
  const [following, setFollowing] = useState(true)

  useEffect(() => {
    const list = listRef.current
    if (!following || !list || activeIndex < 0) return
    const element = list.querySelector<HTMLElement>(`[data-word-index="${activeIndex}"]`)
    if (!element) return
    const top = element.offsetTop
    const bottom = top + element.offsetHeight
    const viewTop = list.scrollTop
    const viewBottom = viewTop + list.clientHeight
    if (top >= viewTop + EDGE_PX && bottom <= viewBottom - EDGE_PX) return
    list.scrollTop = top - list.clientHeight / 2 + element.offsetHeight / 2
  }, [activeIndex, following])

  // Wheel, touch, keys that scroll, and presses on the list's own scrollbar all mean the user is scrolling.
  const pauseFollow = () => setFollowing(false)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (SCROLL_KEYS.has(event.key)) pauseFollow()
  }

  return (
    <div className={styles.body}>
      <div className={styles.toolbar}>
        <span className={styles.hint}>Click a word to seek. Select words to set In and Out.</span>
        {following ? null : (
          <Button size="sm" variant="ghost" onClick={() => setFollowing(true)}>
            Follow playback
          </Button>
        )}
      </div>
      <div
        ref={listRef}
        className={styles.list}
        role="region"
        aria-label="Transcript words"
        tabIndex={-1}
        onWheel={pauseFollow}
        onTouchStart={pauseFollow}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) pauseFollow()
        }}
        onKeyDown={onKeyDown}
        onMouseUp={() => {
          if (listRef.current) applySelectionRange(listRef.current, transcript.words)
        }}
        onKeyUp={(event) => {
          if (event.shiftKey && listRef.current) {
            applySelectionRange(listRef.current, transcript.words)
          }
        }}
      >
        {lines.map((line) => (
          <TranscriptLineView
            key={line.firstIndex}
            line={line}
            activeIndex={line.words.some((entry) => entry.index === activeIndex) ? activeIndex : -1}
          />
        ))}
      </div>
    </div>
  )
}

interface TranscriptLineViewProps {
  line: TranscriptLine
  // The active word when it is in this line, otherwise -1. Other lines skip re-rendering while it moves.
  activeIndex: number
}

const TranscriptLineView = memo(function TranscriptLineView({
  line,
  activeIndex
}: TranscriptLineViewProps): JSX.Element {
  return (
    <p className={styles.line}>
      {line.words.map(({ index, word }) => (
        <span
          key={index}
          data-word-index={index}
          className={index === activeIndex ? styles.current : styles.word}
          onClick={() => seekToWord(word)}
        >
          {word.text}{' '}
        </span>
      ))}
    </p>
  )
})
