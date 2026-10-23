import { cutEnd, type TimelineCut } from '../../shared/timeline'
import { cutAt, nextCutAt } from './preview-math'

/** Where the playhead is on the short's timeline, and whether it is over blank space. */
export interface PreviewReport {
  playhead: number
  blank: boolean
}

/** The clock the music and narration follow. `t` is a timeline time. */
export interface PreviewClock {
  t: number
  playing: boolean
}

export interface PreviewEngine {
  /** Move the playhead to a timeline time. Keeps playing if it was playing. */
  seekOutput(sec: number): void
  /** Re-read the cuts after an edit, keeping the playhead where it is. */
  refresh(): void
  clock(): PreviewClock
  dispose(): void
}

interface EngineOptions {
  video: HTMLVideoElement
  getCuts: () => TimelineCut[]
  getLength: () => number
  onReport: (r: PreviewReport) => void
}

/** How often the playhead is reported while playing. Cut and blank changes are reported at once. */
const REPORT_MS = 100
/** A cut counts as finished this close to its end, so the next one starts without a visible gap. */
const END_EPS = 0.02

/**
 * Plays a short on its own timeline. Inside a cut the video plays its footage, and the timeline time is
 * read back from the video. Over blank space the video is paused and the timeline time runs on its own,
 * so black shows and the music and narration keep going. The video element's own play, pause and scrub
 * controls are followed too, so the stage's controls behave the same as before.
 */
export function createPreviewEngine({ video, getCuts, getLength, onReport }: EngineOptions): PreviewEngine {
  let t = 0
  let playing = false
  // Index of the cut the video is showing, or -1 over blank space.
  let cut = -1
  let raf = 0
  let last = 0
  let lastReport = 0
  // The engine's own play and pause calls fire events too; these flags tell them apart from the user's.
  let expectPlay = false
  let expectPause = false

  const report = (force = false): void => {
    const now = performance.now()
    if (!force && now - lastReport < REPORT_MS) return
    lastReport = now
    onReport({ playhead: t, blank: cut < 0 })
  }

  const pauseVideo = (): void => {
    if (!video.paused) {
      expectPause = true
      video.pause()
    }
  }

  const playVideo = (): void => {
    // Only a paused video fires a play event. Flagging a playing one would swallow the user's next play.
    if (!video.paused) return
    expectPlay = true
    void video.play().catch(() => {
      expectPlay = false
    })
  }

  /** Show a cut's footage at a timeline time. */
  const showCut = (index: number, at: number): void => {
    const c = getCuts()[index]
    cut = index
    t = at
    const src = c.startSec + (at - c.atSec)
    if (Math.abs(video.currentTime - src) > 0.02) video.currentTime = src
    report(true)
  }

  /** Blank space from a timeline time: the video stops and the time runs on without it. */
  const blankAt = (at: number): void => {
    cut = -1
    t = at
    pauseVideo()
    report(true)
  }

  const stopLoop = (): void => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const finish = (): void => {
    playing = false
    stopLoop()
    pauseVideo()
    report(true)
  }

  const frame = (now: number): void => {
    raf = 0
    if (!playing) return
    const dt = (now - last) / 1000
    last = now
    const cuts = getCuts()
    if (cut >= 0 && cuts[cut]) {
      const c = cuts[cut]
      if (video.ended || video.currentTime >= c.endSec - END_EPS) {
        // The cut is over. The next cut plays if it starts right here; otherwise the gap begins.
        const at = cutEnd(c)
        const next = cutAt(cuts, at)
        if (next >= 0) {
          showCut(next, at)
          playVideo()
        } else {
          blankAt(at)
        }
      } else {
        t = c.atSec + (video.currentTime - c.startSec)
      }
    } else {
      if (cut >= 0) cut = -1
      t += dt
      const next = nextCutAt(cuts, t)
      if (next >= 0 && cuts[next].atSec <= t) {
        showCut(next, cuts[next].atSec)
        playVideo()
      }
    }
    if (t >= getLength()) {
      t = getLength()
      finish()
      return
    }
    report()
    raf = requestAnimationFrame(frame)
  }

  const start = (): void => {
    if (t >= getLength() - END_EPS) t = 0
    playing = true
    const i = cutAt(getCuts(), t)
    if (i >= 0) {
      showCut(i, t)
      playVideo()
    } else {
      blankAt(t)
    }
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  const onPlay = (): void => {
    if (expectPlay) {
      expectPlay = false
      return
    }
    if (!playing) start()
  }

  const onPause = (): void => {
    if (expectPause) {
      expectPause = false
      return
    }
    // The video ends by itself at the end of a cut that runs to the footage's end. The frame loop handles that.
    if (video.ended) return
    if (playing) finish()
  }

  /** The video was moved by the user: work out where the playhead is from the footage it now shows. */
  const onSeeked = (): void => {
    if (expectPlay || expectPause) return
    const src = video.currentTime
    const cuts = getCuts()
    const i = cuts.findIndex((c) => src >= c.startSec && src < c.endSec)
    if (playing && i < 0) {
      blankAt(t)
      return
    }
    if (i >= 0) {
      cut = i
      t = cuts[i].atSec + (src - cuts[i].startSec)
    } else {
      cut = -1
    }
    report(true)
  }

  video.addEventListener('play', onPlay)
  video.addEventListener('pause', onPause)
  video.addEventListener('seeked', onSeeked)

  return {
    seekOutput(sec: number): void {
      const was = playing
      finish()
      const length = getLength()
      const at = Math.max(0, Math.min(sec, length))
      const i = cutAt(getCuts(), at)
      if (i >= 0) showCut(i, at)
      else blankAt(at)
      if (was) start()
    },

    refresh(): void {
      const cuts = getCuts()
      const i = cutAt(cuts, t)
      if (i < 0) {
        if (playing) blankAt(t)
        else {
          cut = -1
          report(true)
        }
      } else if (i !== cut) {
        showCut(i, t)
      }
    },

    clock(): PreviewClock {
      return { t, playing }
    },

    dispose(): void {
      stopLoop()
      playing = false
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('seeked', onSeeked)
    }
  }
}
