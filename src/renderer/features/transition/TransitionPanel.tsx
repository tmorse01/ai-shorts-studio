// The Transitions left panel (Epic 08, #97-#98). Its Add menu puts a transition on the cut before the
// clip under the playhead, at the default length. The selected transition is edited in the section below,
// the same section the inspector shows. Each change is one undoable command.
import type { JSX } from 'react'
import { Plus } from 'lucide-react'
import {
  DEFAULT_TRANSITION_MS,
  TRANSITION_KINDS,
  TRANSITION_LABELS,
  cutBefore
} from '@shared/timeline/transitions'
import type { Clip, Timeline, TransitionKind } from '@shared/timeline/timeline'
import { addCutTransition } from '@shared/timeline/edits'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { toast } from '../toasts/toast'
import { playbackStore } from '../playback/playbackStore'
import { projectStore } from '../project/projectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { timelineCommand } from '../timeline/timelineCommands'
import { TransitionSection } from './TransitionSection'
import styles from './TransitionPanel.module.css'

export interface TransitionPanelProps {
  shortId?: string
}

export function TransitionPanel({ shortId }: TransitionPanelProps): JSX.Element {
  const items = TRANSITION_KINDS.map((kind) => ({
    label: `Add ${TRANSITION_LABELS[kind].toLowerCase()} at cut`,
    disabled: shortId === undefined,
    onSelect: () => {
      if (shortId) addAtPlayhead(shortId, kind)
    }
  }))
  return (
    <div className={styles.panel}>
      <DropdownMenu
        align="start"
        items={items}
        trigger={
          <Button variant="primary" disabled={shortId === undefined}>
            <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
            Add transition
          </Button>
        }
      />
      <p className={styles.hint}>
        Adds to the cut before the clip under the playhead. Select a transition on the timeline to
        change its kind or length.
      </p>
      <TransitionSection />
    </div>
  )
}

// Adds a transition on the cut before the clip under the playhead. Each reason it cannot land tells the
// user why, and nothing is added.
function addAtPlayhead(shortId: string, kind: TransitionKind): void {
  const timeline = shortTimeline(shortId)
  if (!timeline) return
  const playheadMs = playbackStore.getState().playheadMs
  const clip = clipAtPlayhead(timeline, playheadMs)
  if (!clip) {
    toast.info({ title: 'No clip under the playhead' })
    return
  }
  if (!cutBefore(timeline, clip.id)) {
    toast.info({ title: 'That clip has no cut before it' })
    return
  }
  if (existingTransitionOn(timeline, clip.id)) {
    toast.info({
      title: 'This cut already has a transition',
      description: 'Select it to change it.'
    })
    return
  }
  const label = `Add ${TRANSITION_LABELS[kind].toLowerCase()} at cut`
  const sourceLengthOf = sourceLengthResolver()
  const add = (current: Timeline): Timeline =>
    addCutTransition(
      current,
      crypto.randomUUID(),
      clip.id,
      kind,
      DEFAULT_TRANSITION_MS,
      sourceLengthOf
    )
  try {
    add(structuredClone(timeline))
  } catch {
    toast.info({ title: 'The handles on this cut are too short for a transition' })
    return
  }
  applyProjectCommand(timelineCommand(shortId, label, new Date().toISOString(), add))
}

// The transition already on the cut before the clip, if any.
function existingTransitionOn(timeline: Timeline, toClipId: string): boolean {
  const cut = cutBefore(timeline, toClipId)
  if (!cut) return false
  return (timeline.transitions ?? []).some(
    (item) => item.fromClipId === cut.from.id && item.toClipId === toClipId
  )
}

function shortTimeline(shortId: string): Timeline | undefined {
  return projectStore.getState().current?.project.shorts.find((item) => item.id === shortId)
    ?.timeline
}

// The clip on the main track that the playhead is inside, or null.
function clipAtPlayhead(timeline: Timeline, playheadMs: number): Clip | null {
  const main = timeline.tracks.find((track) => track.role === 'main')
  return (
    main?.clips.find(
      (clip) => playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs
    ) ?? null
  )
}

function sourceLengthResolver(): (clip: Clip) => number | undefined {
  const media = projectStore.getState().current?.project.media ?? []
  return (clip) => media.find((ref) => ref.id === clip.mediaId)?.durationMs
}
