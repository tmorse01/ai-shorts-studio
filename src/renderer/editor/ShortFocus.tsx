import type { RefObject } from 'react'
import { normalizeSegments } from '../../shared/timeline'
import type { ProjectView } from '../../shared/api'
import type { Short } from '../../shared/types'
import { errorText } from '../util'
import { ClipStage } from './ClipStage'
import { Inspector } from './Inspector'
import { SourceStrip } from './SourceStrip'
import { Timeline } from './Timeline'
import { useShortDraft } from './useShortDraft'

const api = window.studio

export interface ShortFocusProps {
  short: Short
  project: ProjectView
  musicFolderSet: boolean
  notice: { text: string; error: boolean } | null
  videoRef: RefObject<HTMLVideoElement>
  currentTime: number
  onTimeUpdate: () => void
  onSeek: (sourceSec: number) => void
  onBack: () => void
  onSaved: (s: Short) => void
  onDeleted: () => void
  onError: (t: string) => void
  onNotice: (t: string) => void
}

/**
 * The clip-first workspace for one selected short. Owns the unsaved draft so the timeline, the stage
 * and the inspector all edit the same cuts, and renders the centre column and the right pane together.
 */
export function ShortFocus(props: ShortFocusProps) {
  const { short, project, notice, videoRef, currentTime, onSeek, onSaved, onError, onNotice } = props
  const draft = useShortDraft(short)
  const sourceDurationSec = project.probe?.durationSec ?? 0

  const save = async (): Promise<void> => {
    try {
      const updated = await api.updateShort(short.id, {
        title: draft.title,
        segments: normalizeSegments(draft.segments, sourceDurationSec),
        captions: draft.captions,
        settings: draft.settings
      })
      onSaved(updated)
      onNotice('Saved.')
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <>
      <main className="center">
        {notice && <div className={`notice ${notice.error ? 'error' : ''}`}>{notice.text}</div>}
        <ClipStage
          title={draft.title}
          segments={draft.segments}
          settings={draft.settings}
          captions={draft.captions}
          src={api.mediaUrl(project.id)}
          sourceWidth={project.probe?.width ?? 16}
          sourceHeight={project.probe?.height ?? 9}
          videoRef={videoRef}
          sourceDurationSec={sourceDurationSec}
          currentTime={currentTime}
          onTimeUpdate={props.onTimeUpdate}
          onBack={props.onBack}
        />
        <Timeline
          segments={draft.segments}
          onChange={draft.setSegments}
          captions={draft.captions}
          sourceDurationSec={sourceDurationSec}
          hasAudio={project.probe?.hasAudio ?? false}
          musicEnabled={draft.settings.musicEnabled}
          currentTime={currentTime}
          onSeek={onSeek}
        />
        <SourceStrip
          projectId={project.id}
          sourceDurationSec={sourceDurationSec}
          segments={draft.segments}
          currentTime={currentTime}
          canAddCut={draft.segments.length < 6}
          onSeek={onSeek}
          onAddCut={(seg) => draft.setSegments((prev) => normalizeSegments([...prev, seg], sourceDurationSec))}
        />
      </main>
      <aside className="pane">
        <Inspector
          short={short}
          draft={draft}
          projectId={project.id}
          hasAudio={project.probe?.hasAudio ?? false}
          musicFolderSet={props.musicFolderSet}
          onSave={() => void save()}
          onDeleted={props.onDeleted}
          onSaved={onSaved}
          onError={onError}
          onNotice={onNotice}
        />
      </aside>
    </>
  )
}
