import { useState } from 'react'
import type { ProjectView } from '../../shared/api'
import type { MediaView, Short } from '../../shared/types'
import { ShortStrip } from '../editor/ShortStrip'
import { fmt } from '../util'
import styles from './ProjectSidebar.module.css'

export type ClipScope = 'source' | 'all'
type MediaFilter = 'all' | 'video' | 'audio'

export interface ProjectSidebarProps {
  project: ProjectView | null
  /** The video or track the centre column is showing. */
  sourceId: string | null
  onSelectSource: (id: string) => void
  onImport: () => void
  onNewProject: () => void
  onRelink: (assetId: string) => void
  onRemove: (assetId: string) => void
  /** Clips shown in the list, already filtered by `clipScope`. */
  shorts: Short[]
  clipScope: ClipScope
  onClipScope: (scope: ClipScope) => void
  totalClips: number
  selectedId: string | null
  checked: Set<string>
  exportBusy: boolean
  onSelectShort: (id: string) => void
  onToggleChecked: (id: string) => void
  onExport: () => void
}

/**
 * Left column. The project's media library: videos and exports on one side, music on the other, with a
 * filter for each. The clips cut from the selected video sit underneath.
 */
export function ProjectSidebar(props: ProjectSidebarProps) {
  const { project } = props
  const [filter, setFilter] = useState<MediaFilter>('all')

  if (!project) {
    return (
      <aside className={styles.sidebar} aria-label="Media library">
        <section className={styles.section}>
          <h2>Media</h2>
          <div className="muted">No project open. Create one to start adding media.</div>
          <div>
            <button className="primary" onClick={props.onNewProject}>
              New project…
            </button>
          </div>
        </section>
      </aside>
    )
  }

  const videos = project.media.filter((m) => m.kind === 'source')
  const exports = project.media.filter((m) => m.kind === 'export')
  const music = project.media.filter((m) => m.kind === 'music')
  const selected = project.media.find((m) => m.id === props.sourceId) ?? null
  const showVideo = filter !== 'audio'
  const showAudio = filter !== 'video'

  return (
    <aside className={styles.sidebar} aria-label="Media library">
      <section className={styles.section} aria-labelledby="sb-media">
        <div className={styles.heading}>
          <h2 id="sb-media">Media</h2>
          <span className="muted">{project.media.length}</span>
        </div>
        <div className={styles.row}>
          <button className="primary" onClick={props.onImport}>
            Add media…
          </button>
          <div className={styles.segmented} role="radiogroup" aria-label="Show media type">
            <FilterButton value="all" current={filter} onChange={setFilter}>
              All
            </FilterButton>
            <FilterButton value="video" current={filter} onChange={setFilter}>
              Video
            </FilterButton>
            <FilterButton value="audio" current={filter} onChange={setFilter}>
              Audio
            </FilterButton>
          </div>
        </div>

        {project.media.length === 0 && (
          <div className="muted">No media yet. Add videos or music; the files stay where they are on disk.</div>
        )}

        {showVideo && videos.length > 0 && (
          <MediaGroup label="Videos" items={videos} selectedId={props.sourceId} onSelect={props.onSelectSource} />
        )}
        {showVideo && exports.length > 0 && (
          <MediaGroup label="Exports" items={exports} selectedId={props.sourceId} onSelect={props.onSelectSource} />
        )}
        {showAudio && music.length > 0 && (
          <MediaGroup label="Music" items={music} selectedId={props.sourceId} onSelect={props.onSelectSource} />
        )}
        {filter !== 'all' && (filter === 'video' ? videos.length + exports.length : music.length) === 0 && (
          <div className="muted">No {filter} files in this project yet.</div>
        )}

        {selected && (
          <div className={styles.row}>
            {selected.kind !== 'export' && (
              <button onClick={() => props.onRelink(selected.id)}>{selected.missing ? 'Find file…' : 'Relink…'}</button>
            )}
            <button className="danger" onClick={() => props.onRemove(selected.id)}>
              Remove from project
            </button>
          </div>
        )}
        {selected?.missing && (
          <div className="notice error">{selected.name} was moved or deleted. Relink it to use it again.</div>
        )}
      </section>

      {props.totalClips > 0 ? (
        <section className={styles.section} aria-labelledby="sb-clips">
          <div className={styles.heading}>
            <h2 id="sb-clips">Clips · {props.shorts.length}</h2>
            <div className={styles.segmented} role="radiogroup" aria-label="Which clips to list">
              <ScopeButton value="source" current={props.clipScope} onChange={props.onClipScope}>
                This video
              </ScopeButton>
              <ScopeButton value="all" current={props.clipScope} onChange={props.onClipScope}>
                All
              </ScopeButton>
            </div>
          </div>
          {props.shorts.length > 0 ? (
            <ShortStrip
              shorts={props.shorts}
              selectedId={props.selectedId ?? ''}
              checked={props.checked}
              exportBusy={props.exportBusy}
              onSelect={props.onSelectShort}
              onToggle={props.onToggleChecked}
              onExport={props.onExport}
            />
          ) : (
            <div className="muted">No clips from this video yet. Generate clips with AI or mark a manual short.</div>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          <h2>Clips</h2>
          <div className="muted">Clips you generate or mark will be listed here.</div>
        </section>
      )}
    </aside>
  )
}

function MediaGroup({
  label,
  items,
  selectedId,
  onSelect
}: {
  label: string
  items: MediaView[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className={styles.group}>
      <div className={styles.groupLabel}>{label}</div>
      <ul className={styles.mediaList} aria-label={label}>
        {items.map((m) => (
          <li key={m.id}>
            <button className={styles.mediaButton} aria-current={m.id === selectedId} onClick={() => onSelect(m.id)}>
              <span className={styles.fileName} title={m.path}>
                {m.kind === 'music' ? '♪ ' : ''}
                {m.name}
              </span>
              <span className={styles.facts}>
                {m.missing ? (
                  <span className={styles.missing}>Missing</span>
                ) : m.kind === 'music' ? (
                  <>Audio · {fmt(m.probe.durationSec)}</>
                ) : (
                  <>
                    {m.probe.width}×{m.probe.height} · {fmt(m.probe.durationSec)}
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FilterButton({
  value,
  current,
  onChange,
  children
}: {
  value: MediaFilter
  current: MediaFilter
  onChange: (filter: MediaFilter) => void
  children: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      className={styles.segment}
      onClick={() => onChange(value)}
    >
      {children}
    </button>
  )
}

function ScopeButton({
  value,
  current,
  onChange,
  children
}: {
  value: ClipScope
  current: ClipScope
  onChange: (scope: ClipScope) => void
  children: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      className={styles.segment}
      onClick={() => onChange(value)}
    >
      {children}
    </button>
  )
}
