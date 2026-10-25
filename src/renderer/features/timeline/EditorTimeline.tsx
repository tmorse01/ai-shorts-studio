import { useCallback, useMemo, type JSX } from 'react'
import type { Timeline } from '@shared/timeline/timeline'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { targetRangeMs } from './editorTimelineModel'
import { timelineCommand } from './timelineCommands'
import { TimelinePane, type TimelineEdit } from './TimelinePane'
import { useOfflineMediaIds } from './useOfflineMediaIds'

export interface EditorTimelineProps {
  timeline: Timeline
  shortId: string
}

// The editor's bottom pane for the open short. Every edit runs as a timeline command in the project
// history, so it can be undone, and a drag or trim folds into one entry through its merge key.
export function EditorTimeline({ timeline, shortId }: EditorTimelineProps): JSX.Element {
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? '')
  const media = useProjectStore((state) => state.current?.project.media)
  const moments = useProjectStore((state) => state.current?.project.moments)
  // Primitive selectors keep the store subscription stable across renders.
  const minMs = useProjectStore((state) => targetRangeMs(state.current?.project, shortId).minMs)
  const maxMs = useProjectStore((state) => targetRangeMs(state.current?.project, shortId).maxMs)
  const offlineIds = useOfflineMediaIds(folderPath, media)
  const target = useMemo(() => ({ minMs, maxMs }), [minMs, maxMs])
  const mediaInfo = useMemo(
    () => ({ projectFolder: folderPath, items: media ?? [], offlineIds, moments }),
    [folderPath, media, offlineIds, moments]
  )

  const onEdit = useCallback(
    (label: string, edit: TimelineEdit, mergeKey?: string) => {
      applyProjectCommand(timelineCommand(shortId, label, new Date().toISOString(), edit, mergeKey))
    },
    [shortId]
  )

  return (
    <TimelinePane
      timeline={timeline}
      target={target}
      onEdit={onEdit}
      shortId={shortId}
      media={mediaInfo}
    />
  )
}
