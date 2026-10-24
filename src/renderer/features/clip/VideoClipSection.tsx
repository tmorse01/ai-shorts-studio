import type { JSX, ReactNode } from 'react'
import { Film } from 'lucide-react'
import type { Moment } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { TimecodeField } from '@renderer/ui/TimecodeField'
import { SoundFields } from '@renderer/features/audio/SoundFields'
import { useProjectStore } from '../project/useProjectStore'
import { sourceStore } from '../source/sourceStore'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { VideoClipTarget } from '../inspector/inspectorStore'
import { setDuration, setSourceIn, setSourceOut, sourceWindowOf } from './videoClipFields'
import styles from './VideoClipSection.module.css'

// The inspector's video clip section (Epic 08, #96 and #99), in the Video tab. With one clip selected it
// shows the clip's source, with Show in source viewer, and its Source In, Out and Duration. The sound
// (volume, mute and fades) shows while the clip's sound is attached, and with several clips selected it
// shows the sound they share. Each change is one undoable edit.
export function VideoClipSection(): JSX.Element {
  const target = useInspectorStore((state) => state.videoTarget)
  const sound = useInspectorStore((state) => state.audioTarget)
  if (!target && !sound) {
    return <p className={styles.empty}>Select a video clip to see its properties.</p>
  }
  return (
    <div className={styles.body}>
      {target ? <VideoClipForm key={target.clip.id} target={target} /> : null}
      {sound ? (
        <div className={styles.sound}>
          <SoundFields target={sound} />
        </div>
      ) : null}
    </div>
  )
}

interface VideoClipFormProps {
  target: VideoClipTarget
}

function VideoClipForm({ target }: VideoClipFormProps): JSX.Element {
  const { clip, apply } = target
  const media = useProjectStore((state) =>
    state.current?.project.media.find((item) => item.id === clip.mediaId)
  )
  const moment = useProjectStore((state) =>
    state.current?.project.moments.find((item) => item.id === clip.momentId)
  )
  const span = sourceWindowOf(clip)
  const sourceLengthMs = media?.durationMs

  return (
    <div className={styles.body}>
      <div className={styles.source}>
        <span className={styles.sourceName} title={media?.fileName}>
          {media?.fileName ?? 'Missing source'}
        </span>
        {moment ? <span className={styles.moment}>{moment.name}</span> : null}
        <Button
          variant="secondary"
          disabled={!clip.mediaId}
          onClick={() => showInSource(clip.mediaId, moment)}
        >
          <Film size={14} strokeWidth={1.75} aria-hidden="true" />
          Show in source viewer
        </Button>
      </div>

      <Field label="Source in">
        <TimecodeField
          label="Source in"
          valueMs={span.inMs}
          onChange={(ms) => apply('Trim start', setSourceIn(clip, ms))}
        />
      </Field>
      <Field label="Source out">
        <TimecodeField
          label="Source out"
          valueMs={span.outMs}
          onChange={(ms) => apply('Trim end', setSourceOut(clip, ms, sourceLengthMs))}
        />
      </Field>
      <Field label="Duration">
        <TimecodeField
          label="Duration"
          valueMs={span.durationMs}
          onChange={(ms) => apply('Change duration', setDuration(clip, ms, sourceLengthMs))}
        />
      </Field>
    </div>
  )
}

// Opens the clip's footage in the source viewer. A clip made from a moment opens on the moment's range.
function showInSource(mediaId: string | undefined, moment: Moment | undefined): void {
  if (!mediaId) return
  if (moment) sourceStore.getState().openRange(mediaId, moment.inMs, moment.outMs)
  else sourceStore.getState().openSource(mediaId)
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the short properties rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
