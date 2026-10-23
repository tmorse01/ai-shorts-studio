import { useEffect, useState } from 'react'
import { Download, Film, FileX, LayoutGrid, Music, Scissors, type LucideIcon } from 'lucide-react'
import type { ProjectView } from '../../shared/api'
import type { MediaView, Short } from '../../shared/types'
import { ShortStrip } from '../editor/ShortStrip'
import { Tip } from '../ui/Tip'
import { MediaCard } from './MediaCard'
import styles from './ProjectSidebar.module.css'

const api = window.studio

export type ClipScope = 'source' | 'all'
export type MediaCategory = 'all' | 'videos' | 'exports' | 'music' | 'missing' | 'clips'

const CATEGORIES: { id: MediaCategory; label: string; Icon: LucideIcon }[] = [
  { id: 'all', label: 'All', Icon: LayoutGrid },
  { id: 'videos', label: 'Videos', Icon: Film },
  { id: 'exports', label: 'Exports', Icon: Download },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'missing', label: 'Missing', Icon: FileX },
  { id: 'clips', label: 'Clips', Icon: Scissors }
]

export interface ProjectSidebarProps {
  project: ProjectView | null
  /** The video or track the centre column is showing. */
  sourceId: string | null
  onSelectSource: (id: string) => void
  onImport: () => void
  onNewProject: () => void
  onRelink: (assetId: string) => void
  onRemove: (assetId: string) => void
  /** Clips shown in the Clips category, already filtered by `clipScope`. */
  shorts: Short[]
  clipScope: ClipScope
  onClipScope: (scope: ClipScope) => void
  /** How many clips each library entry has, keyed by asset id. Drives the "Added" badge. */
  clipCounts: Record<string, number>
  totalClips: number
  selectedId: string | null
  checked: Set<string>
  exportBusy: boolean
  onSelectShort: (id: string) => void
  onToggleChecked: (id: string) => void
  onExport: () => void
}

/**
 * Left panel, laid out like a desktop media browser. A narrow rail picks a category (All, Videos, Exports,
 * Music, Missing, Clips); the content area shows that category as a grid of cards or as the clip list.
 */
export function ProjectSidebar(props: ProjectSidebarProps) {
  const { project } = props
  const [category, setCategory] = useState<MediaCategory>('all')
  const [posterRev, setPosterRev] = useState(0)
  const projectId = project?.id ?? null
  const mediaCount = project?.media.length ?? 0

  // Make sure every video has a poster. Cards show a placeholder until this resolves, then re-request images.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    api
      .ensurePosters(projectId)
      .then(() => !cancelled && setPosterRev((r) => r + 1))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [projectId, mediaCount])

  if (!project) {
    return (
      <aside className={styles.panel} aria-label="Media library">
        <div className={styles.empty}>
          <div className="muted">No project open. Create one to start adding media.</div>
          <button className="primary" onClick={props.onNewProject}>
            New project…
          </button>
        </div>
      </aside>
    )
  }

  const media = project.media
  const inCategory = (m: MediaView): boolean => {
    switch (category) {
      case 'videos':
        return m.kind === 'source'
      case 'exports':
        return m.kind === 'export'
      case 'music':
        return m.kind === 'music'
      case 'missing':
        return m.missing
      default:
        return true
    }
  }
  const counts: Record<MediaCategory, number> = {
    all: media.length,
    videos: media.filter((m) => m.kind === 'source').length,
    exports: media.filter((m) => m.kind === 'export').length,
    music: media.filter((m) => m.kind === 'music').length,
    missing: media.filter((m) => m.missing).length,
    clips: props.totalClips
  }
  const items = media.filter(inCategory)
  const selected = media.find((m) => m.id === props.sourceId) ?? null
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? ''

  return (
    <aside className={styles.panel} aria-label="Media library">
      <nav className={styles.rail} aria-label="Media categories">
        {CATEGORIES.map((c) => (
          <Tip key={c.id} label={`${c.label} · ${counts[c.id]}`}>
            <button
              type="button"
              className={styles.railItem}
              aria-label={c.label}
              aria-current={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              <c.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Tip>
        ))}
      </nav>

      <div className={styles.content}>
        <div className={styles.toolbar}>
          <button className="primary" onClick={props.onImport}>
            Import
          </button>
          {category === 'clips' && (
            <div className={styles.segmented} role="radiogroup" aria-label="Which clips to list">
              <ScopeButton value="source" current={props.clipScope} onChange={props.onClipScope}>
                This video
              </ScopeButton>
              <ScopeButton value="all" current={props.clipScope} onChange={props.onClipScope}>
                All
              </ScopeButton>
            </div>
          )}
        </div>

        <div className={styles.heading}>
          <span>{label}</span>
          <span className="muted">{category === 'clips' ? props.shorts.length : items.length}</span>
        </div>

        {category === 'clips' ? (
          props.shorts.length > 0 ? (
            <ShortStrip
              shorts={props.shorts}
              selectedId={props.selectedId ?? ''}
              checked={props.checked}
              exportBusy={props.exportBusy}
              posterRev={posterRev}
              onSelect={props.onSelectShort}
              onToggle={props.onToggleChecked}
              onExport={props.onExport}
            />
          ) : (
            <div className="muted">No clips yet. Generate clips with AI or mark a manual short.</div>
          )
        ) : items.length > 0 ? (
          <div className={styles.grid}>
            {items.map((m) => (
              <MediaCard
                key={m.id}
                asset={m}
                selected={m.id === props.sourceId}
                clipCount={props.clipCounts[m.id] ?? 0}
                posterRev={posterRev}
                onSelect={props.onSelectSource}
              />
            ))}
          </div>
        ) : (
          <div className="muted">
            {media.length === 0
              ? 'No media yet. Import videos or music; the files stay where they are on disk.'
              : `Nothing in ${label.toLowerCase()} yet.`}
          </div>
        )}

        {category !== 'clips' && selected && (
          <div className={styles.actions}>
            <span className={styles.selectedName} title={selected.path}>
              {selected.name}
            </span>
            {selected.kind !== 'export' && (
              <button onClick={() => props.onRelink(selected.id)}>{selected.missing ? 'Find file…' : 'Relink…'}</button>
            )}
            <button className="danger" onClick={() => props.onRemove(selected.id)}>
              Remove
            </button>
          </div>
        )}
      </div>
    </aside>
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
