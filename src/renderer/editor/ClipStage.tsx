import type { RefObject } from 'react'
import { fmt } from '../util'
import type { Caption, Segment } from '../../shared/timeline'
import type { ShortSettings } from '../../shared/types'
import { VideoPlayer, type ScrubSpan } from '../player/VideoPlayer'
import { activeCaption, frameAspect, playbackStep, videoStyle } from './preview-math'
import styles from './ClipStage.module.css'

export interface ClipStageProps {
  title: string
  segments: Segment[]
  settings: ShortSettings
  captions: Caption[]
  src: string
  sourceWidth: number
  sourceHeight: number
  videoRef: RefObject<HTMLVideoElement>
  sourceDurationSec: number
  currentTime: number
  onTimeUpdate: () => void
  onBack: () => void
}

/**
 * Focused center stage for the selected short. The output frame shows framing and captions as the export
 * draws them. Playback skips the gaps between cuts, so the clip plays the way it will export.
 */
export function ClipStage({
  title,
  segments,
  settings,
  captions,
  src,
  sourceWidth,
  sourceHeight,
  videoRef,
  sourceDurationSec,
  currentTime,
  onTimeUpdate,
  onBack
}: ClipStageProps) {
  const cutIndex = segments.findIndex((s) => currentTime >= s.startSec && currentTime < s.endSec)
  const source = { width: sourceWidth, height: sourceHeight }
  const aspect = frameAspect(settings.ratio, source)
  const caption = settings.captionsEnabled ? activeCaption(captions, currentTime) : null
  // Export uses captionFontSize px on a 1080px-wide frame; express it in container units to match.
  const captionSize = `${(settings.captionFontSize / 1080) * 100}cqw`
  // Only while playing and not mid-seek: a scrub into a gap should stay where the user put it, and a
  // paused video should not move on its own.
  const handleTimeUpdate = (): void => {
    const v = videoRef.current
    if (v && !v.paused && !v.seeking) {
      const step = playbackStep(segments, v.currentTime)
      if (step.kind === 'seek') v.currentTime = step.sec
      else if (step.kind === 'end') v.pause()
    }
    onTimeUpdate()
  }
  const cutSpans: ScrubSpan[] = segments.map((s, i) => ({
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
          frameStyle={{ aspectRatio: String(aspect), height: 'min(56vh, 480px)', width: 'auto' }}
          videoStyle={videoStyle(settings.framing, settings.ratio, source)}
          onTimeUpdate={handleTimeUpdate}
          overlay={caption && <div className={styles.caption} style={{ fontSize: captionSize }}>{caption.text}</div>}
        />
      </div>

      <div className={styles.transport}>
        <span className={styles.position}>
          {fmt(currentTime)} / {fmt(sourceDurationSec)}
        </span>
        <span className={styles.cutState}>{cutIndex >= 0 ? `In cut ${cutIndex + 1}` : 'Between cuts'}</span>
      </div>
    </section>
  )
}
