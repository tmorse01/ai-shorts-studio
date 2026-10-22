import { segmentsDuration } from '../../shared/timeline'
import type { Short } from '../../shared/types'
import styles from './ShortStrip.module.css'

export interface ShortStripProps {
  shorts: Short[]
  selectedId: string
  checked: Set<string>
  exportBusy: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onExport: () => void
}

/** Every short in the project as a vertical list for the sidebar: select to edit, tick to export. */
export function ShortStrip({ shorts, selectedId, checked, exportBusy, onSelect, onToggle, onExport }: ShortStripProps) {
  return (
    <div className={styles.strip}>
      <div className={styles.list} role="list" aria-label="Shorts in this project">
        {shorts.map((s) => {
          const active = s.id === selectedId
          return (
            <div key={s.id} role="listitem" className={styles.tile} data-active={active}>
              <label className={styles.check} aria-label={`Include ${s.title} in export`}>
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => onToggle(s.id)} />
              </label>
              <button className={styles.select} onClick={() => onSelect(s.id)} aria-current={active}>
                <span className={styles.title}>
                  {s.rank !== null && <span className={styles.rank}>#{s.rank}</span>}
                  {s.title}
                </span>
                <span className={styles.meta}>
                  {segmentsDuration(s.segments).toFixed(1)}s · {s.segments.length} cut{s.segments.length === 1 ? '' : 's'}
                  {s.exportedPath && ' · exported'}
                </span>
              </button>
            </div>
          )
        })}
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
