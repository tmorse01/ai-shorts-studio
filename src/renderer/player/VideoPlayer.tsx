import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { TimeSpan } from './player-math'
import {
  CONTROLS_HIDE_MS,
  FRAME_RATE,
  PLAYBACK_RATES,
  SKIP_SEC,
  clampTime,
  fractionAtTime,
  frameStepSec,
  pointerFraction,
  spanPercent,
  timeAtFraction,
  timecode
} from './player-math'
import { ExitFullscreenIcon, FullscreenIcon, MuteIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, VolumeIcon } from './icons'
import { Tip } from '../ui/Tip'
import styles from './VideoPlayer.module.css'

/** A highlighted range on the scrubber. `tone` picks the cut colour, 1 to 3. */
export interface ScrubSpan {
  span: TimeSpan
  tone: 1 | 2 | 3
}

export interface VideoPlayerProps {
  src: string
  /** Known from the probe. Used for the scrubber before the file's metadata has loaded. */
  durationSec: number
  label: string
  /** Cuts or other ranges to draw on the scrubber. */
  spans?: ScrubSpan[]
  /** In and out points to mark on the scrubber. */
  marks?: { inSec: number | null; outSec: number | null }
  onTimeUpdate?: () => void
  /** Called the first time playback starts (play button, space, or clicking the frame). */
  onPlay?: () => void
  /** Drawn above the video, under the controls. Used for burned-in caption previews. */
  overlay?: ReactNode
  /** Width over height of the frame. Fullscreen keeps this ratio and adds black bars around it. */
  aspect?: number
  /** Caps the frame height, e.g. `min(56vh, 480px)`. The width follows the aspect. Omit to fill the width. */
  frameHeight?: string
  videoStyle?: CSSProperties
  /** Drops the skip, volume and speed controls so the bar fits a narrow frame. Keys still work. */
  compact?: boolean
}

/**
 * Custom player: the native controls are hidden and replaced with a branded control bar. The forwarded
 * ref is the <video> element, so existing keyboard and loop-preview code keeps working unchanged.
 */
export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(function VideoPlayer(props, forwarded) {
  const { src, durationSec, label, spans = [], marks, onTimeUpdate, onPlay, overlay, aspect = 16 / 9, frameHeight, videoStyle, compact = false } = props

  const videoEl = useRef<HTMLVideoElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number | null>(null)
  const dragging = useRef(false)
  const scrubValue = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState<TimeSpan[]>([])
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [active, setActive] = useState(true)

  const total = duration > 0 ? duration : durationSec
  const shown = scrubTime ?? time

  // Share the element with both the forwarded ref and our own handlers.
  const setVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoEl.current = el
      if (typeof forwarded === 'function') forwarded(el)
      else if (forwarded) forwarded.current = el
    },
    [forwarded]
  )

  /** Show the bar, then hide it again after a pause while playing. */
  const wake = useCallback(() => {
    setActive(true)
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      if (videoEl.current && !videoEl.current.paused) setActive(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    },
    []
  )

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (videoEl.current) videoEl.current.playbackRate = rate
  }, [rate])

  const seekTo = (sec: number): void => {
    const v = videoEl.current
    if (v) v.currentTime = clampTime(sec, total)
  }

  const togglePlay = (): void => {
    const v = videoEl.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }

  const toggleMute = (): void => {
    const v = videoEl.current
    if (v) v.muted = !v.muted
  }

  const toggleFullscreen = (): void => {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void root.requestFullscreen().catch(() => undefined)
  }

  // Player keys. Space and the arrows are handled by the app shell so they work on every view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const v = videoEl.current
      if (!v) return
      switch (e.key.toLowerCase()) {
        case 'j':
          seekTo(v.currentTime - SKIP_SEC)
          break
        case 'l':
          seekTo(v.currentTime + SKIP_SEC)
          break
        case 'k':
          v.pause()
          break
        case 'm':
          toggleMute()
          break
        case 'f':
          toggleFullscreen()
          break
        case ',':
          v.pause()
          seekTo(v.currentTime - frameStepSec(FRAME_RATE))
          break
        case '.':
          v.pause()
          seekTo(v.currentTime + frameStepSec(FRAME_RATE))
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // seekTo and toggles read refs and the latest total through closures; re-bind when the length changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  // Scrubbing: pointer drag previews the time, and release commits one seek.
  const scrubTo = (clientX: number): void => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = timeAtFraction(pointerFraction(clientX, { left: rect.left, width: rect.width }), total)
    scrubValue.current = t
    setScrubTime(t)
  }

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubTo(e.clientX)
  }

  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragging.current) scrubTo(e.clientX)
  }

  const onTrackUp = (): void => {
    if (!dragging.current) return
    dragging.current = false
    seekTo(scrubValue.current)
    setScrubTime(null)
  }

  const readBuffered = (v: HTMLVideoElement): TimeSpan[] => {
    const out: TimeSpan[] = []
    for (let i = 0; i < v.buffered.length; i++) out.push({ startSec: v.buffered.start(i), endSec: v.buffered.end(i) })
    return out
  }

  const fraction = fractionAtTime(shown, total)

  // Custom properties, not inline width/height: the fullscreen rule in the CSS has to be able to override them.
  const frameVars = {
    '--aspect': String(aspect),
    '--frame-w': frameHeight ? `calc(${frameHeight} * ${aspect})` : '100%',
    '--frame-h': frameHeight ?? 'auto'
  } as CSSProperties

  return (
    <div ref={rootRef} className={styles.root} onPointerMove={wake} data-playing={playing} data-visible={!playing || active}>
      <div className={styles.frame} style={frameVars}>
        <video
          ref={setVideo}
          src={src}
          preload="metadata"
          className={styles.video}
          style={videoStyle}
          onClick={togglePlay}
          aria-label={label}
          onPlay={() => {
            setPlaying(true)
            wake()
            onPlay?.()
          }}
          onPause={() => {
            setPlaying(false)
            setActive(true)
          }}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration)
            e.currentTarget.playbackRate = rate
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime)
            onTimeUpdate?.()
          }}
          onProgress={(e) => setBuffered(readBuffered(e.currentTarget))}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume)
            setMuted(e.currentTarget.muted)
          }}
        />

        {overlay}

        {!playing && (
          <button type="button" className={styles.bigPlay} onClick={togglePlay} aria-label="Play">
            <PlayIcon />
          </button>
        )}

        <div className={styles.bar}>
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            className={styles.track}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(total * 100) / 100}
            aria-valuenow={Math.round(shown * 100) / 100}
            aria-valuetext={timecode(shown)}
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerCancel={onTrackUp}
          >
            {buffered.map((b, i) => (
              <div key={i} className={styles.buffered} style={spanPercent(b, total)} />
            ))}
            {spans.map((s, i) => (
              <div key={i} className={styles.span} data-tone={s.tone} style={spanPercent(s.span, total)} />
            ))}
            {marks?.inSec != null && <div className={styles.mark} style={{ left: `${fractionAtTime(marks.inSec, total) * 100}%` }} />}
            {marks?.outSec != null && <div className={styles.mark} style={{ left: `${fractionAtTime(marks.outSec, total) * 100}%` }} />}
            <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
            <div className={styles.knob} style={{ left: `${fraction * 100}%` }} />
          </div>

          <div className={styles.controls}>
            <Tip label={playing ? 'Pause (K)' : 'Play (Space)'}>
              <button type="button" className={styles.iconButton} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
            </Tip>
            {!compact && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => seekTo(shown - SKIP_SEC)}
                aria-label={`Back ${SKIP_SEC} seconds`}
              >
                <SkipBackIcon />
              </button>
            )}
            {!compact && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => seekTo(shown + SKIP_SEC)}
                aria-label={`Forward ${SKIP_SEC} seconds`}
              >
                <SkipForwardIcon />
              </button>
            )}

            <span className={styles.time}>
              {timecode(shown)} <span className={styles.timeTotal}>/ {timecode(total)}</span>
            </span>

            <span className={styles.spacer} />

            <Tip label={muted ? 'Unmute (M)' : 'Mute (M)'}>
              <button type="button" className={styles.iconButton} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
              </button>
            </Tip>
            {!compact && (
              <input
                type="range"
                className={styles.volume}
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = videoEl.current
                  if (!v) return
                  v.muted = false
                  v.volume = Number(e.target.value)
                }}
              />
            )}

            {!compact && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" className={styles.rate} aria-label={`Playback speed ${rate}×`}>
                    {rate}×
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className={styles.menu} sideOffset={6} align="end">
                    <DropdownMenu.RadioGroup value={String(rate)} onValueChange={(v) => setRate(Number(v))}>
                      {PLAYBACK_RATES.map((r) => (
                        <DropdownMenu.RadioItem key={r} value={String(r)} className={styles.menuItem}>
                          <DropdownMenu.ItemIndicator className={styles.check}>✓</DropdownMenu.ItemIndicator>
                          {r}×
                        </DropdownMenu.RadioItem>
                      ))}
                    </DropdownMenu.RadioGroup>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}

            <Tip label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
            </Tip>
          </div>
        </div>
      </div>
    </div>
  )
})
