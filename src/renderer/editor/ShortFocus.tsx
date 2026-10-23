import { useEffect, useRef, useState, type RefObject } from 'react'
import { tidyCuts, type Segment } from '../../shared/timeline'
import type { ProjectView } from '../../shared/api'
import type { MediaView, MusicClip, Short } from '../../shared/types'
import { errorText } from '../util'
import { ClipStage } from './ClipStage'
import { Inspector } from './Inspector'
import { SourceStrip } from './SourceStrip'
import { Timeline } from './Timeline'
import { useShortDraft } from './useShortDraft'
import type { PreviewEngine } from './preview-engine'
import { placeNewCut } from './timeline-model'

const api = window.studio

export interface ShortFocusProps {
  short: Short
  project: ProjectView
  /** The video this clip was cut from. */
  source: MediaView
  notice: { text: string; error: boolean } | null
  videoRef: RefObject<HTMLVideoElement>
  /** Source time of the video, which the source strip shows. */
  currentTime: number
  onTimeUpdate: () => void
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
  const { short, project, source, notice, videoRef, currentTime, onSaved, onError, onNotice } = props
  const draft = useShortDraft(short)
  const sourceDurationSec = source.probe.durationSec
  // The playhead is on the timeline, so it is kept here and the stage reports it as it moves.
  const [playheadSec, setPlayheadSec] = useState(0)
  const engineRef = useRef<PreviewEngine | null>(null)
  const lengthSec = draft.settings.lengthSec

  // The draft drives the preview, so music clips play before they are saved.
  const musicClips = draft.settings.musicClips
  const musicPreview = musicClips.flatMap((clip) => {
    const asset = project.media.find((m) => m.id === clip.assetId && m.kind === 'music' && !m.missing)
    return asset ? [{ ...clip, url: api.musicUrl(asset.id) }] : []
  })
  const timelineMusic = musicClips.map((clip) => {
    const asset = project.media.find((m) => m.id === clip.assetId)
    return { ...clip, name: asset?.name ?? 'Missing track', trackDurationSec: asset?.probe.durationSec ?? 0 }
  })
  const narrationUrl = short.narrationPath
    ? api.narrationUrl(short.id, short.narrationPath.split(/[\\/]/).pop())
    : null

  /** A track dropped at a point on the timeline becomes one clip, from the start of the track. */
  const assignMusic = (assetId: string, atSec: number): void => {
    const asset = project.media.find((m) => m.id === assetId && m.kind === 'music' && !m.missing)
    if (!asset || asset.probe.durationSec <= 0) return
    const clip: MusicClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      startSec: atSec,
      trackStartSec: 0,
      lengthSec: asset.probe.durationSec
    }
    draft.setSettings({ ...draft.settings, musicClips: [...musicClips, clip] })
  }

  const setMusicClips = (next: MusicClip[]): void => draft.setSettings({ ...draft.settings, musicClips: next })

  /** A source-strip cut goes into the first free space on the timeline, from the playhead. */
  const addCut = (seg: Segment): void => {
    const placed = placeNewCut(draft.segments, seg, lengthSec, playheadSec)
    if (!placed) {
      onError('There is no free space on the timeline for that cut. Make the short longer or move a cut.')
      return
    }
    draft.setSegments((prev) => [...prev, placed])
  }

  /** The source strip works in source time. Move to the timeline point that plays that footage, if there is one. */
  const seekSource = (sourceSec: number): void => {
    const cut = draft.segments.find((c) => sourceSec >= c.startSec && sourceSec < c.endSec)
    if (cut && engineRef.current) engineRef.current.seekOutput(cut.atSec + (sourceSec - cut.startSec))
    else if (videoRef.current) videoRef.current.currentTime = sourceSec
  }

  // Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes. Text fields keep their own undo.
  const { undo, redo } = draft
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const save = async (): Promise<void> => {
    try {
      const updated = await api.updateShort(short.id, {
        title: draft.title,
        segments: tidyCuts(draft.segments, lengthSec),
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
          lengthSec={lengthSec}
          settings={draft.settings}
          captions={draft.captions}
          src={api.mediaUrl(source.id)}
          posterUrl={api.clipFrameUrl(short.id, short.updatedAt, 'preview')}
          musicClips={musicPreview}
          narrationUrl={narrationUrl}
          sourceWidth={source.probe.width}
          sourceHeight={source.probe.height}
          videoRef={videoRef}
          sourceDurationSec={sourceDurationSec}
          playheadSec={playheadSec}
          onPlayhead={setPlayheadSec}
          engineRef={engineRef}
          onTimeUpdate={props.onTimeUpdate}
          onBack={props.onBack}
        />
        <Timeline
          segments={draft.segments}
          onChange={draft.setSegments}
          lengthSec={lengthSec}
          captions={draft.captions}
          sourceDurationSec={sourceDurationSec}
          hasAudio={source.probe.hasAudio}
          musicClips={timelineMusic}
          onMusicClipsChange={setMusicClips}
          onAssignMusic={assignMusic}
          onGestureStart={draft.beginGesture}
          onGestureEnd={draft.endGesture}
          canUndo={draft.canUndo}
          canRedo={draft.canRedo}
          onUndo={undo}
          onRedo={redo}
          playheadSec={playheadSec}
          onSeekOutput={(sec) => engineRef.current?.seekOutput(sec)}
        />
        <SourceStrip
          projectId={project.id}
          assetId={source.id}
          sourceDurationSec={sourceDurationSec}
          segments={draft.segments}
          currentTime={currentTime}
          canAddCut={draft.segments.length < 6}
          onSeek={seekSource}
          onAddCut={addCut}
        />
      </main>
      <aside className="pane">
        <Inspector
          short={short}
          draft={draft}
          projectId={project.id}
          hasAudio={source.probe.hasAudio}
          musicClipCount={musicClips.length}
          playheadSec={playheadSec}
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
