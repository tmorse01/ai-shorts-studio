import type { JSX, ReactNode } from 'react'
import { Film } from 'lucide-react'
import { setClipAudio } from '@shared/timeline/edits'
import type { Moment } from '@shared/project/schema'
import type { Clip } from '@shared/timeline/timeline'
import { Button } from '@renderer/ui/Button'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { TimecodeField } from '@renderer/ui/TimecodeField'
import { dbToGain, formatDb, gainToDb, parseDb, SILENT_DB } from '@renderer/ui/fieldMath'
import { useProjectStore } from '../project/useProjectStore'
import { sourceStore } from '../source/sourceStore'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { VideoClipTarget } from '../inspector/inspectorStore'
import { setDuration, setSourceIn, setSourceOut, sourceWindowOf } from './videoClipFields'
import styles from './VideoClipSection.module.css'

// The inspector's video clip section (Epic 08, #96), in the Video tab. It shows the clip's source, with
// Show in source viewer, and its Source In, Out and Duration. Linked audio (volume, mute and fades) shows
// only while the clip's sound is attached. Each change is one undoable edit.
export function VideoClipSection(): JSX.Element {
  const target = useInspectorStore((state) => state.videoTarget)
  if (!target) {
    return <p className={styles.empty}>Select a video clip to see its properties.</p>
  }
  return <VideoClipForm key={target.clip.id} target={target} />
}

interface VideoClipFormProps {
  target: VideoClipTarget
}

function VideoClipForm({ target }: VideoClipFormProps): JSX.Element {
  const { clip, linkedAudio, apply } = target
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

      {linkedAudio ? <LinkedAudio audio={linkedAudio} apply={apply} /> : null}
    </div>
  )
}

interface LinkedAudioProps {
  audio: Clip
  apply: VideoClipTarget['apply']
}

// The sound of the clip while it is linked. Edits go to the audio clip, the one whose sound plays.
function LinkedAudio({ audio, apply }: LinkedAudioProps): JSX.Element {
  const muted = audio.muted ?? false
  const gain = audio.gain ?? 1

  return (
    <div className={styles.sound}>
      <Field label="Sound">
        <Button
          variant="secondary"
          aria-pressed={muted}
          onClick={() =>
            apply(muted ? 'Unmute clip' : 'Mute clip', (timeline) =>
              setClipAudio(timeline, audio.id, { muted: !muted })
            )
          }
        >
          {muted ? 'Unmute' : 'Mute'}
        </Button>
      </Field>
      <Field label="Volume">
        <SliderNumberField
          label="Clip volume"
          value={gainToDb(gain)}
          min={SILENT_DB}
          max={gainToDb(2)}
          step={0.5}
          format={formatDb}
          parse={parseDb}
          onChange={(db) =>
            apply(
              'Change clip volume',
              (timeline) => setClipAudio(timeline, audio.id, { gain: dbToGain(db) }),
              `clip-volume-${audio.id}`
            )
          }
        />
      </Field>
      <Field label="Fade in">
        <TimecodeField
          label="Fade in"
          valueMs={audio.fadeInMs ?? 0}
          onChange={(ms) =>
            apply('Change fade in', (timeline) =>
              setClipAudio(timeline, audio.id, { fadeInMs: ms })
            )
          }
        />
      </Field>
      <Field label="Fade out">
        <TimecodeField
          label="Fade out"
          valueMs={audio.fadeOutMs ?? 0}
          onChange={(ms) =>
            apply('Change fade out', (timeline) =>
              setClipAudio(timeline, audio.id, { fadeOutMs: ms })
            )
          }
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
