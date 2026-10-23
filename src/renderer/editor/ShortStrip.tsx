import { useEffect, useState } from 'react'
import { segmentsDuration } from '../../shared/timeline'
import type { Short } from '../../shared/types'
import { fmt } from '../util'
import styles from './ShortStrip.module.css'

const api = window.studio

export interface ShortStripProps {
  shorts: Short[]
  selectedId: string
  checked: Set<string>
  exportBusy: boolean
  /** Changes when posters are regenerated, so card images are requested again. */
  posterRev: number
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onExport: () => void
}

/**
 * Every short in the project as a grid of cards for the sidebar. Each card shows its source video's poster,
 * its length and its rank. Select a card to edit it; tick its corner box to include it in an export.
 */
export function ShortStrip({
  shorts,
  selectedId,
  checked,
  exportBusy,
  posterRev,
  onSelect,
  onToggle,
  onExport
}: ShortStripProps) {
  return (
    <div className={styles.strip}>
      <div className={styles.grid} role="list" aria-label="Shorts in this project">
        {shorts.map((s) => (
          <ClipCard
            key={s.id}
            short={s}
            active={s.id === selectedId}
            checked={checked.has(s.id)}
            posterRev={posterRev}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <span className="muted">{checked.size} selected</span>
        <button className="primary" disabled={checked.size === 0 || exportBusy} onClick={onExport}>
          Export selected…
        </button>
      </div>
    </div>
  )
}

function ClipCard({
  short,
  active,
  checked,
  posterRev,
  onSelect,
  onToggle
}: {
  short: Short
  active: boolean
  checked: boolean
  posterRev: number
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const [posterFailed, setPosterFailed] = useState(false)
  // A regenerated poster may fix an earlier failure, so try again.
  useEffect(() => setPosterFailed(false), [posterRev])

  const duration = segmentsDuration(short.segments)
  const cuts = `${short.segments.length} cut${short.segments.length === 1 ? '' : 's'}`

  return (
    <div role="listitem" className={styles.card} data-active={active}>
      <button
        type="button"
        className={styles.select}
        aria-current={active}
        title={short.title}
        onClick={() => onSelect(short.id)}
      >
        <div className={styles.thumb}>
          {short.sourceId && !posterFailed ? (
            <img
              src={`${api.posterUrl(short.sourceId)}?v=${posterRev}`}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setPosterFailed(true)}
            />
          ) : (
            <span className={styles.placeholder} aria-hidden="true">
              ▶
            </span>
          )}
          <span className={styles.duration}>{fmt(duration)}</span>
          {short.rank !== null && <span className={styles.rank}>#{short.rank}</span>}
          {short.exportedPath && <span className={styles.exported}>Exported</span>}
        </div>
        <span className={styles.title}>{short.title}</span>
        <span className={styles.meta}>
          {duration.toFixed(1)}s · {cuts}
        </span>
      </button>
      <label className={styles.check} aria-label={`Include ${short.title} in export`}>
        <input type="checkbox" checked={checked} onChange={() => onToggle(short.id)} />
      </label>
    </div>
  )
}
