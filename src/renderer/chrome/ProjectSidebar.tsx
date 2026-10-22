import { useState } from 'react'
import type { ProjectView } from '../../shared/api'
import type { SettingsView, Short } from '../../shared/types'
import { ShortStrip } from '../editor/ShortStrip'
import { errorText, fmt } from '../util'
import styles from './ProjectSidebar.module.css'

const api = window.studio

export interface ProjectSidebarProps {
  projects: ProjectView[]
  projectId: string | null
  newName: string
  onNewNameChange: (value: string) => void
  onSelectProject: (id: string) => void
  onCreateProject: () => void
  project: ProjectView | null
  onImport: (relink: boolean) => void
  onDeleteProject: (id: string) => void
  settings: SettingsView | null
  onSettingsChange: (s: SettingsView) => void
  onPickMusic: () => void
  onError: (t: string) => void
  shorts: Short[]
  selectedId: string | null
  checked: Set<string>
  exportBusy: boolean
  onSelectShort: (id: string) => void
  onToggleChecked: (id: string) => void
  onExport: () => void
}

/**
 * Left column. Three working sections for the open project (Project, Source, Clips) and a collapsed
 * Project settings section for the API key, music folder and tool status.
 */
export function ProjectSidebar(props: ProjectSidebarProps) {
  const { project, settings } = props
  const fileName = project?.sourcePath?.replace(/\\/g, '/').split('/').pop() ?? null

  return (
    <aside className={styles.sidebar} aria-label="Project sidebar">
      <section className={styles.section} aria-labelledby="sb-project">
        <h2 id="sb-project">Project</h2>
        <div className={styles.row}>
          <input
            type="text"
            aria-label="New project name"
            placeholder="New project name"
            value={props.newName}
            onChange={(e) => props.onNewNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && props.onCreateProject()}
          />
          <button className="primary" onClick={props.onCreateProject}>
            Add
          </button>
        </div>
        {props.projects.length === 0 && <div className="muted">No projects yet. Create one to begin.</div>}
        <ul className={styles.projectList} aria-label="Projects">
          {props.projects.map((p) => (
            <li key={p.id}>
              <button
                className={styles.projectButton}
                aria-current={p.id === props.projectId}
                onClick={() => props.onSelectProject(p.id)}
              >
                <span>{p.name}</span>
                <span className="muted">{p.sourcePath ? (p.sourceMissing ? 'Source missing' : 'Source linked') : 'No video yet'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {project && (
        <section className={styles.section} aria-labelledby="sb-source">
          <h2 id="sb-source">Source</h2>
          {project.sourcePath ? (
            <div className={styles.facts}>
              <span className={styles.fileName} title={project.sourcePath}>{fileName}</span>
              {project.probe && (
                <span className="muted">
                  {project.probe.width}×{project.probe.height} · {fmt(project.probe.durationSec)} · {project.probe.videoCodec}
                </span>
              )}
            </div>
          ) : (
            <div className="muted">Pick a local MP4 or MOV. The file stays where it is.</div>
          )}
          {project.sourceMissing && <div className="notice error">The file was moved or deleted. Relink it.</div>}
          <div className={styles.row}>
            <button onClick={() => props.onImport(Boolean(project.sourcePath))}>
              {project.sourcePath ? 'Relink…' : 'Import…'}
            </button>
            <button className="danger" onClick={() => props.onDeleteProject(project.id)}>
              Delete project
            </button>
          </div>
        </section>
      )}

      {project && props.shorts.length > 0 && (
        <section className={styles.section} aria-labelledby="sb-clips">
          <h2 id="sb-clips">Clips · {props.shorts.length}</h2>
          <ShortStrip
            shorts={props.shorts}
            selectedId={props.selectedId ?? ''}
            checked={props.checked}
            exportBusy={props.exportBusy}
            onSelect={props.onSelectShort}
            onToggle={props.onToggleChecked}
            onExport={props.onExport}
          />
        </section>
      )}

      <details className={styles.settings}>
        <summary>Project settings</summary>
        <div className={styles.settingsBody}>
          <ApiKeyBox settings={settings} onChange={props.onSettingsChange} onError={props.onError} />
          <div className="muted">Music folder: {settings?.musicFolder ?? 'none set (music is optional)'}</div>
          <button onClick={props.onPickMusic}>Choose music folder…</button>
          <div className="muted">
            FFmpeg: {settings?.ffmpegAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}. Speech-to-text:{' '}
            {settings?.whisperAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}.
          </div>
        </div>
      </details>
    </aside>
  )
}

function ApiKeyBox({
  settings,
  onChange,
  onError
}: {
  settings: SettingsView | null
  onChange: (s: SettingsView) => void
  onError: (t: string) => void
}) {
  const [key, setKey] = useState('')
  const save = async (): Promise<void> => {
    try {
      onChange(await api.setApiKey(key))
      setKey('')
    } catch (err) {
      onError(errorText(err))
    }
  }
  return (
    <div className="stack">
      <div className="muted">
        Anthropic API key: {settings?.hasApiKey ? 'saved (encrypted by Windows for this account)' : 'not set'}.
        Frames and transcript excerpts are sent to Anthropic for analysis; full videos never are. Protection depends on
        your Windows account security.
      </div>
      <div className="row">
        <input type="text" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        <button disabled={key.trim().length < 20} onClick={() => void save()}>
          Save
        </button>
      </div>
      {settings?.hasApiKey && (
        <button className="danger" onClick={() => void api.clearApiKey().then(onChange)}>
          Remove key
        </button>
      )}
    </div>
  )
}
