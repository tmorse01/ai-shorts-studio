import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { fmt } from '../util'
import { remapCaptions, type Caption, type TimelineCut } from '../../shared/timeline'
import type { ShortSettings } from '../../shared/types'
import { VideoPlayer, type ScrubSpan } from '../player/VideoPlayer'
import { PreviewAudio, type PreviewMusicClip } from './PreviewAudio'
import { createPreviewEngine, type PreviewClock, type PreviewEngine } from './preview-engine'
import { activeCaption, cutAt, frameAspect, videoStyle } from './preview-math'
import styles from './ClipStage.module.css'

const IDLE_CLOCK: PreviewClock = { t: 0, playing: false }

export interface ClipStageProps {
  title: string
  segments: TimelineCut[]
  /** How long the short is on its timeline. Blank space up to here plays as black. */
  lengthSec: number
  settings: ShortSettings
  /** Captions in source time, as the draft holds them. They are remapped to the timeline for display. */
  captions: Caption[]
  src: string
  /** The music pieces on this short's timeline, with the library track each plays from. */
  musicClips: PreviewMusicClip[]
  /** Recorded narration for this short, or null. */
  narrationUrl: string | null
  /** The clip's own frame, shown over the video until playback starts. */
  posterUrl: string
  sourceWidth: number
  sourceHeight: number
  videoRef: RefObject<HTMLVideoElement>
  sourceDurationSec: number
  /** Where the playhead is on the timeline. */
  playheadSec: number
  /** Called as the playhead moves, so the timeline can show it. */
  onPlayhead: (sec: number) => void
  /** The engine is published here, so the timeline and the source strip can move the playhead. */
  engineRef: MutableRefObject<PreviewEngine | null>
  onTimeUpdate: () => void
  onBack: () => void
}

/**
 * Focused center stage for the selected short. The output frame shows framing and captions as the export
 * draws them. The preview plays on the short's own timeline: blank space shows as black, and the music and
 * narration keep going over it, the same as the export.
 */
export function ClipStage({
  title,
  segments,
  lengthSec,
  settings,
  captions,
  src,
  musicClips,
  narrationUrl,
  posterUrl,
  sourceWidth,
  sourceHeight,
  videoRef,
  sourceDurationSec,
  playheadSec,
  onPlayhead,
  engineRef,
  onTimeUpdate,
  onBack
}: ClipStageProps) {
  const source = { width: sourceWidth, height: sourceHeight }
  const aspect = frameAspect(settings.ratio, source)
  const timelineCaptions = useMemo(() => remapCaptions(captions, segments), [captions, segments])
  const caption = settings.captionsEnabled ? activeCaption(timelineCaptions, playheadSec) : null
  const cutIndex = cutAt(segments, playheadSec)
  // The clip's frame stands in for the video until it first plays, so the preview shows the clip before play.
  const [started, setStarted] = useState(false)
  const [posterFailed, setPosterFailed] = useState(false)
  const [blank, setBlank] = useState(false)
  const frameStyle = videoStyle(settings.framing, settings.ratio, source)
  // Export uses captionFontSize px on a 1080px-wide frame; express it in container units to match.
  const captionSize = `${(settings.captionFontSize / 1080) * 100}cqw`

  // The engine reads the latest cuts and length through these, so an edit never needs a new engine.
  const cutsRef = useRef(segments)
  const lengthRef = useRef(lengthSec)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const engine = createPreviewEngine({
      video,
      getCuts: () => cutsRef.current,
      getLength: () => lengthRef.current,
      onReport: (r) => {
        setBlank(r.blank)
        onPlayhead(r.playhead)
      }
    })
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [videoRef, engineRef, onPlayhead])

  useEffect(() => {
    cutsRef.current = segments
    lengthRef.current = lengthSec
    engineRef.current?.refresh()
  }, [segments, lengthSec, engineRef])

  // The clock the music and narration follow. Stable, so the audio does not re-wire on every render.
  const getClock = useCallback(() => engineRef.current?.clock() ?? IDLE_CLOCK, [engineRef])

  const cutSpans: ScrubSpan[] = segments.map((s, i) => ({
    // The scrubber is in source time, so the highlights are the footage each cut plays.
    span: { startSec: s.startSec, endSec: s.endSec },
    tone: ((i % 3) + 1) as ScrubSpan['tone']
  }))

  return (
    <section className={styles.stage} aria-label={`Editing ${title}`}>
      <div className={styles.head}>
        <button onClick={onBack}>← All shorts</button>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.count}>
          {segments.length} cut{segments.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.frameWrap}>
        <VideoPlayer
          ref={videoRef}
          src={src}
          durationSec={sourceDurationSec}
          label="Source preview"
          compact
          spans={cutSpans}
          aspect={aspect}
          frameHeight="min(56vh, 480px)"
          videoStyle={frameStyle}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setStarted(true)}
          overlay={
            <>
              {!started && !posterFailed && (
                <img
                  className={styles.poster}
                  src={posterUrl}
                  alt=""
                  draggable={false}
                  style={frameStyle}
                  onError={() => setPosterFailed(true)}
                />
              )}
              {blank && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: '#000' }} />}
              {caption && <div className={styles.caption} style={{ fontSize: captionSize }}>{caption.text}</div>}
            </>
          }
        />
        <PreviewAudio
          videoRef={videoRef}
          getClock={getClock}
          musicClips={musicClips}
          musicVolume={settings.musicVolume}
          musicDuck={settings.musicDuck}
          narrationUrl={narrationUrl}
        />
      </div>

      <div className={styles.transport}>
        <span className={styles.position}>
          {fmt(playheadSec)} / {fmt(lengthSec)}
        </span>
        <span className={styles.cutState}>{cutIndex >= 0 ? `In cut ${cutIndex + 1}` : 'Blank space'}</span>
      </div>
    </section>
  )
}
