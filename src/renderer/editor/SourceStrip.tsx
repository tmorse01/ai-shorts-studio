import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizeSegments, type Segment } from '../../shared/timeline'
import type { ThumbStatus } from '../../shared/api'
import { fmt } from '../util'
import styles from './SourceStrip.module.css'

const api = window.studio
/** A drag shorter than this is a click: it seeks instead of adding a cut. */
const MIN_NEW_CUT_SEC = 1

export interface SourceStripProps {
  projectId: string
  sourceDurationSec: number
  segments: Segment[]
  currentTime: number
  canAddCut: boolean
  onSeek: (sourceSec: number) => void
  onAddCut: (seg: Segment) => void
}

/**
 * The whole source footage as a strip of thumbnails, with the short's cuts marked on it. Dragging
 * across the strip adds a cut; a click seeks. Thumbnails are generated in the background and cached.
 */
export function SourceStrip({
  projectId,
  sourceDurationSec,
  segments,
  currentTime,
  canAddCut,
  onSeek,
  onAddCut
}: SourceStripProps) {
  const [thumbs, setThumbs] = useState<ThumbStatus | null>(null)
  const [dragRange, setDragRange] = useState<{ a: number; b: number } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ a: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      api
        .ensureThumbnails(projectId)
        .then((status) => !cancelled && setThumbs(status))
        .catch(() => !cancelled && setThumbs(null))
    }
    load()
    // A thumbnail job can be waiting behind another job; ask again whenever any job finishes.
    const unsubscribe = api.onJobUpdate((job) => {
      if (job.projectId === projectId && job.status !== 'running' && job.status !== 'queued') load()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [projectId])

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return frac * sourceDurationSec
  }

  const begin = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const t = timeAt(e.clientX)
    dragRef.current = { a: t }
    setDragRange({ a: t, b: t })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return
    setDragRange({ a: dragRef.current.a, b: timeAt(e.clientX) })
  }

  const end = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    setDragRange(null)
    if (!drag) return
    const b = timeAt(e.clientX)
    const start = Math.min(drag.a, b)
    const finish = Math.max(drag.a, b)
    if (finish - start >= MIN_NEW_CUT_SEC && canAddCut) {
      const [cut] = normalizeSegments([{ startSec: start, endSec: finish }], sourceDurationSec)
      if (cut) onAddCut(cut)
    } else {
      onSeek(drag.a)
    }
  }

  const pct = (sec: number): string => `${(sec / sourceDurationSec) * 100}%`
  const ready = thumbs?.ready === true
  const playheadLeft = pct(Math.min(currentTime, sourceDurationSec))

  return (
    <section className={styles.strip} aria-label="Source footage">
      <div className={styles.head}>
        <span className="label">Source</span>
        <span className={`muted mono ${styles.duration}`}>{fmt(sourceDurationSec)}</span>
        <span className="muted">
          {ready ? 'Drag across the footage to add a cut. Click to seek.' : 'Thumbnails are generating. You can still click to seek.'}
        </span>
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          dragRef.current = null
          setDragRange(null)
        }}
      >
        {ready && thumbs && (
          <div className={styles.thumbs} aria-hidden="true">
            {Array.from({ length: thumbs.count }, (_, i) => (
              <img key={i} src={api.thumbnailUrl(projectId, i)} alt="" loading="lazy" draggable={false} />
            ))}
          </div>
        )}
        {segments.map((s, i) => (
          <div
            key={i}
            className={styles.cut}
            data-tone={(i % 3) + 1}
            style={{ left: pct(s.startSec), width: `${((s.endSec - s.startSec) / sourceDurationSec) * 100}%` }}
          >
            <span className={styles.cutNumber}>{i + 1}</span>
          </div>
        ))}
        {dragRange && (
          <div
            className={styles.drag}
            style={{
              left: pct(Math.min(dragRange.a, dragRange.b)),
              width: `${(Math.abs(dragRange.b - dragRange.a) / sourceDurationSec) * 100}%`
            }}
          />
        )}
        <div className={styles.playhead} style={{ left: playheadLeft }} aria-hidden="true" />
      </div>
      {!canAddCut && <span className="muted">A short can use up to 6 cuts. Remove one to add another.</span>}
    </section>
  )
}
