import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectView } from '../shared/api'
import type { Ratio } from '../shared/timeline'
import type { SceneDetection } from '../shared/schemas'
import type { ExportPrefs, Job, MediaView, SettingsView, Short } from '../shared/types'
import { ShortFocus } from './editor/ShortFocus'
import { ConfirmDialog } from './chrome/ConfirmDialog'
import { type ClipScope, ProjectSidebar } from './chrome/ProjectSidebar'
import { MenuBar, type MenuDef } from './chrome/MenuBar'
import { TitleBar } from './chrome/TitleBar'
import { VideoPlayer } from './player/VideoPlayer'
import { Select } from './ui/Select'
import { ExportDialog } from './export/ExportDialog'
import { ExportProgressDialog } from './export/ExportProgressDialog'
import { AnalysisProgressDialog } from './analysis/AnalysisProgressDialog'
import { NewProjectDialog } from './dialogs/NewProjectDialog'
import { ProjectSettingsDialog } from './dialogs/ProjectSettingsDialog'
import { SettingsDialog } from './dialogs/SettingsDialog'
import { ShortcutsDialog } from './dialogs/ShortcutsDialog'
import { errorText, fmt } from './util'

const api = window.studio

const RATIO_OPTIONS = [
  { value: '9:16', label: '9:16 vertical' },
  { value: '1:1', label: '1:1 square' },
  { value: '16:9', label: '16:9 landscape' },
  { value: 'original', label: 'Original' }
]

const JOB_LABEL: Record<Job['kind'], string> = {
  analysis: 'Analyzing',
  export: 'Exporting',
  proxy: 'Preparing preview',
  thumbs: 'Preparing thumbnails'
}

const SCENE_OPTIONS = [
  { value: 'full', label: 'Full scan (slowest)' },
  { value: 'keyframes', label: 'Keyframes only (faster)' },
  { value: 'off', label: 'Off (even grid)' }
]

const DEFAULT_PROMPT = 'Find the three best action moments and make 30–60-second vertical shorts.'

export default function App() {
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [shorts, setShorts] = useState<Short[]>([])
  const [clipScope, setClipScope] = useState<ClipScope>('source')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [markIn, setMarkIn] = useState<number | null>(null)
  const [markOut, setMarkOut] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [exportView, setExportView] = useState<'settings' | 'progress' | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [exportStarting, setExportStarting] = useState(false)
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const projectIdRef = useRef<string | null>(null)

  const project = projects.find((p) => p.id === projectId) ?? null
  const source: MediaView | null = project?.media.find((m) => m.id === sourceId) ?? null
  const selected = shorts.find((s) => s.id === selectedId) ?? null
  const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'queued') ?? null
  const analysisJob = jobs.find((j) => j.id === analysisJobId && j.kind === 'analysis') ?? null

  const say = useCallback((text: string, error = false) => setNotice({ text, error }), [])
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn()
      } catch (err) {
        say(errorText(err), true)
        return undefined
      }
    },
    [say]
  )

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects()
    setProjects(list)
    return list
  }, [])

  const refreshShorts = useCallback(async (id: string | null) => {
    setShorts(id ? await api.listShorts(id) : [])
  }, [])

  useEffect(() => {
    void refreshProjects().then((list) => list[0] && setProjectId(list[0].id))
    void api.getSettings().then(setSettings)
    void api.listJobs().then(setJobs)
    return api.onJobUpdate((job) => {
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, 100))
      if (job.status !== 'running' && job.status !== 'queued') {
        void refreshShorts(projectIdRef.current)
        void refreshProjects()
      }
    })
  }, [refreshProjects, refreshShorts])

  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

  // A different project starts with no clip open, no marks and no checked clips.
  useEffect(() => {
    void refreshShorts(projectId)
    setSelectedId(null)
    setChecked(new Set())
    setMarkIn(null)
    setMarkOut(null)
    setClipScope('source')
  }, [projectId, refreshShorts])

  // Keep a video selected whenever the library changes: the first imported one by default.
  useEffect(() => {
    if (!project) {
      setSourceId(null)
      return
    }
    if (sourceId && project.media.some((m) => m.id === sourceId)) return
    setSourceId(project.media.find((m) => m.kind === 'source')?.id ?? project.media[0]?.id ?? null)
  }, [project, sourceId])

  // Ask the main process to start a playback preview when the selected video needs one.
  useEffect(() => {
    if (!sourceId) return
    api
      .prepareMedia(sourceId)
      .then(() => refreshProjects())
      .catch((err: unknown) => say(errorText(err), true))
  }, [sourceId, refreshProjects, say])

  // Keyboard: space toggles play, arrows seek. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return
      // Space and arrows belong to the open dialog while one is showing.
      if (document.querySelector('.modal-backdrop')) return
      const v = videoRef.current
      if (!v) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (v.paused) void v.play()
        else v.pause()
      } else if (e.code === 'ArrowLeft') {
        v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 1 : 5))
      } else if (e.code === 'ArrowRight') {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + (e.shiftKey ? 1 : 5))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onTimeUpdate = (): void => {
    const v = videoRef.current
    if (v) setCurrentTime(v.currentTime)
  }

  // ---- project actions ----
  const createProject = async (name: string): Promise<void> => {
    const created = await run(() => api.createProject(name))
    if (created) {
      await refreshProjects()
      setProjectId(created.id)
      setNewProjectOpen(false)
      say('Project created. Add media to begin.')
    }
  }

  const renameProject = async (name: string): Promise<void> => {
    if (!projectId) return
    const updated = await run(() => api.renameProject(projectId, name))
    if (updated) {
      await refreshProjects()
      say('Project renamed.')
    }
  }

  async function deleteProject(id: string): Promise<void> {
    const ok = await run(async () => {
      await api.deleteProject(id)
      return true
    })
    if (ok) {
      setProjectId(null)
      await refreshProjects()
      say('Project removed. Your source videos were not touched.')
    }
  }

  // ---- media actions ----
  const selectSource = (id: string): void => {
    setSourceId(id)
    setSelectedId(null)
    setMarkIn(null)
    setMarkOut(null)
  }

  const importMedia = async (): Promise<void> => {
    if (!projectId) return
    const before = new Set(project?.media.map((m) => m.id) ?? [])
    const updated = await run(() => api.importMedia(projectId))
    if (!updated) return
    const added = updated.media.filter((m) => !before.has(m.id))
    await refreshProjects()
    if (added.length > 0) {
      selectSource(added[0].id)
      say(`Added ${added.length} file${added.length === 1 ? '' : 's'}. ${added[0].name} is open.`)
    }
  }

  const relinkMedia = async (assetId: string): Promise<void> => {
    const updated = await run(() => api.relinkMedia(assetId))
    if (updated) {
      await refreshProjects()
      say('Video relinked.')
    }
  }

  const removeMedia = async (assetId: string): Promise<void> => {
    const updated = await run(() => api.removeMedia(assetId))
    if (updated) {
      await refreshProjects()
      say('Removed from the project. The file was not deleted.')
    }
  }

  // ---- clip actions ----
  const selectShort = (id: string): void => {
    const short = shorts.find((s) => s.id === id)
    setSelectedId(id)
    if (short?.sourceId) setSourceId(short.sourceId)
  }

  const addManualShort = async (): Promise<void> => {
    if (!projectId || !source || markIn === null || markOut === null) return
    const created = await run(() => api.createShort(projectId, source.id, [{ startSec: markIn, endSec: markOut }]))
    if (created) {
      await refreshShorts(projectId)
      setSelectedId(created.id)
      setMarkIn(null)
      setMarkOut(null)
      say(`Added "${created.title}".`)
    }
  }

  const toggleChecked = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const checkedShorts = shorts.filter((s) => checked.has(s.id))
  const visibleShorts = clipScope === 'all' ? shorts : shorts.filter((s) => s.sourceId === sourceId)
  const clipCounts = shorts.reduce<Record<string, number>>((acc, s) => {
    if (s.sourceId) acc[s.sourceId] = (acc[s.sourceId] ?? 0) + 1
    return acc
  }, {})
  const exportJob = jobs.find((j) => j.id === exportJobId) ?? null

  const startExport = async (prefs: ExportPrefs, overwrite: boolean): Promise<void> => {
    if (!projectId || checked.size === 0) return
    setExportStarting(true)
    const job = await run(() =>
      api.startExport({
        projectId,
        shortIds: checkedShorts.map((s) => s.id),
        outputDir: prefs.outputDir,
        overwrite,
        options: prefs.options
      })
    )
    setExportStarting(false)
    if (!job) return
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
    setExportJobId(job.id)
    setExportView('progress')
    setSettings((prev) => (prev ? { ...prev, lastExport: prefs } : prev))
  }

  const cancelExport = (): void => {
    if (exportJob) void run(() => api.cancelJob(exportJob.id))
  }

  // ---- Ctrl shortcuts. Rebound each render so they always see current state; skipped under a dialog. ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (document.querySelector('.modal-backdrop')) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        setNewProjectOpen(true)
      } else if (key === 'i' && projectId) {
        e.preventDefault()
        void importMedia()
      } else if (key === 'e' && checked.size > 0 && !activeJob) {
        e.preventDefault()
        setExportView('settings')
      } else if (key === ',' && project) {
        e.preventDefault()
        setProjectSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const menus: MenuDef[] = [
    {
      label: 'File',
      entries: [
        { type: 'item', label: 'New project…', shortcut: 'Ctrl+N', onSelect: () => setNewProjectOpen(true) },
        {
          type: 'submenu',
          label: 'Open project',
          entries: projects.length
            ? projects.map((p) => ({
                type: 'item' as const,
                label: p.name,
                checked: p.id === projectId,
                onSelect: () => setProjectId(p.id)
              }))
            : [{ type: 'item', label: 'No projects yet', disabled: true, onSelect: () => undefined }]
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Add media…',
          shortcut: 'Ctrl+I',
          disabled: !project,
          onSelect: () => void importMedia()
        },
        {
          type: 'item',
          label: 'Export checked clips…',
          shortcut: 'Ctrl+E',
          disabled: checked.size === 0 || activeJob !== null,
          onSelect: () => setExportView('settings')
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Remove project…',
          danger: true,
          disabled: !project,
          onSelect: () => project && setConfirmDeleteId(project.id)
        }
      ]
    },
    {
      label: 'Project',
      entries: [
        {
          type: 'item',
          label: 'Project settings…',
          shortcut: 'Ctrl+,',
          disabled: !project,
          onSelect: () => setProjectSettingsOpen(true)
        },
        {
          type: 'item',
          label: 'Relink selected video…',
          disabled: source?.kind !== 'source',
          onSelect: () => source && void relinkMedia(source.id)
        },
        {
          type: 'item',
          label: 'Remove selected video from project',
          danger: true,
          disabled: !source,
          onSelect: () => source && void removeMedia(source.id)
        }
      ]
    },
    {
      label: 'Tools',
      entries: [{ type: 'item', label: 'Settings…', onSelect: () => setSettingsOpen(true) }]
    },
    {
      label: 'Help',
      entries: [{ type: 'item', label: 'Keyboard shortcuts', onSelect: () => setShortcutsOpen(true) }]
    }
  ]

  const hasKey = settings?.hasApiKey ?? false
  const sourceReady = Boolean(source && !source.missing)

  return (
    <>
    <TitleBar
      menu={<MenuBar menus={menus} />}
      projectName={project?.name ?? null}
      sourceName={source?.name ?? null}
      sourceMissing={Boolean(source?.missing)}
      jobLabel={activeJob ? JOB_LABEL[activeJob.kind] : null}
      jobProgress={activeJob?.progress ?? 0}
    />
    <div className="layout">
      <ProjectSidebar
        project={project}
        sourceId={sourceId}
        onSelectSource={selectSource}
        onImport={() => void importMedia()}
        onNewProject={() => setNewProjectOpen(true)}
        onRelink={(id) => void relinkMedia(id)}
        onRemove={(id) => void removeMedia(id)}
        shorts={visibleShorts}
        clipScope={clipScope}
        onClipScope={setClipScope}
        clipCounts={clipCounts}
        totalClips={shorts.length}
        selectedId={selectedId}
        checked={checked}
        exportBusy={activeJob !== null}
        onSelectShort={selectShort}
        onToggleChecked={toggleChecked}
        onExport={() => setExportView('settings')}
      />

      {selected && project && source && sourceReady ? (
        <ShortFocus
          key={selected.id}
          short={selected}
          project={project}
          source={source}
          notice={notice}
          videoRef={videoRef}
          currentTime={currentTime}
          onTimeUpdate={onTimeUpdate}
          onSeek={(sec) => {
            if (videoRef.current) videoRef.current.currentTime = sec
          }}
          onBack={() => setSelectedId(null)}
          onSaved={(updated) => setShorts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
          onDeleted={() => {
            void run(async () => {
              await api.deleteShort(selected.id)
              setSelectedId(null)
              await refreshShorts(projectId)
            })
          }}
          onError={(t) => say(t, true)}
          onNotice={(t) => say(t)}
        />
      ) : (
      <>
      <main className="center">
        {notice && <div className={`notice ${notice.error ? 'error' : ''}`}>{notice.text}</div>}

        {!project ? (
          <div className="empty">
            <div>
              <div style={{ color: 'var(--text)', marginBottom: 6 }}>No project open</div>
              Create one with File ▸ New project, then add videos from the Media panel.
            </div>
          </div>
        ) : !source ? (
          <div className="empty">
            <div>
              <div style={{ color: 'var(--text)', marginBottom: 6 }}>No video selected</div>
              Add media with File ▸ Add media…, then pick one in the Media panel.
            </div>
          </div>
        ) : source.missing ? (
          <div className="empty">
            <div>
              <div style={{ color: 'var(--text)', marginBottom: 6 }}>{source.name} is missing</div>
              It was moved or deleted. Relink it from the Media panel.
            </div>
          </div>
        ) : (
          <>
            {source.kind === 'music' ? (
              <div className="card stack">
                <h2>{source.name}</h2>
                <audio controls preload="metadata" src={api.mediaUrl(source.id)} />
                <div className="muted">Music bed. Clips use the project's music files; turn music on per clip in the editor.</div>
              </div>
            ) : (
              <VideoPlayer
                ref={videoRef}
                src={api.mediaUrl(source.id)}
                durationSec={source.probe.durationSec}
                label={source.kind === 'export' ? 'Exported clip' : 'Source video'}
                marks={{ inSec: markIn, outSec: markOut }}
                onTimeUpdate={onTimeUpdate}
              />
            )}
            <div className="row">
              <span className="muted">
                {fmt(currentTime)} / {fmt(source.probe.durationSec)}
              </span>
              <button onClick={() => setMarkIn(currentTime)}>Set in {markIn !== null ? `(${fmt(markIn)})` : ''}</button>
              <button onClick={() => setMarkOut(currentTime)}>Set out {markOut !== null ? `(${fmt(markOut)})` : ''}</button>
              <button
                className="primary"
                disabled={source.kind !== 'source' || markIn === null || markOut === null || markOut <= markIn}
                onClick={() => void addManualShort()}
              >
                Add manual short
              </button>
              <button onClick={() => { setMarkIn(null); setMarkOut(null) }}>Clear marks</button>
            </div>
            {markIn !== null && markOut !== null && markOut > markIn && (
              <div className="muted">
                Selection {fmt(markIn)} → {fmt(markOut)} ({(markOut - markIn).toFixed(1)}s). Manual shorts must be 10–90s.
              </div>
            )}

            {source.kind === 'source' ? (
              <AiPanel
                project={project}
                source={source}
                hasKey={hasKey}
                busy={activeJob !== null}
                onStarted={(job) => {
                  setJobs((prev) => [job, ...prev])
                  setAnalysisJobId(job.id)
                  setAnalysisOpen(true)
                  say('Analysis started.')
                }}
                onError={(t) => say(t, true)}
              />
            ) : (
              <div className="muted">This is an exported clip. Clips are cut from imported source videos.</div>
            )}
          </>
        )}
      </main>

      <aside className="pane">
        <p className="muted">Select a clip in the sidebar to edit its cuts, framing, captions and audio.</p>
      </aside>
      </>
      )}

      {exportView === 'settings' && (
        <ExportDialog
          shorts={checkedShorts}
          initial={settings?.lastExport ?? null}
          starting={exportStarting}
          onStart={(prefs, overwrite) => void startExport(prefs, overwrite)}
          onClose={() => setExportView(null)}
          onError={(t) => say(t, true)}
        />
      )}
      {exportView === 'progress' && exportJob && (
        <ExportProgressDialog
          job={exportJob}
          onCancel={cancelExport}
          onMinimize={() => setExportView(null)}
          onClose={() => setExportView(null)}
          onError={(t) => say(t, true)}
        />
      )}

      {analysisOpen && analysisJob && (
        <AnalysisProgressDialog
          job={analysisJob}
          onCancel={() => void run(() => api.cancelJob(analysisJob.id))}
          onMinimize={() => setAnalysisOpen(false)}
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      <NewProjectDialog
        open={newProjectOpen}
        defaultName={`Project ${projects.length + 1}`}
        onCreate={createProject}
        onClose={() => setNewProjectOpen(false)}
      />
      <ProjectSettingsDialog
        open={projectSettingsOpen}
        project={project}
        onRename={renameProject}
        onClose={() => setProjectSettingsOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        onError={(t) => say(t, true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <footer className="bottombar">
        {activeJob ? (
          <>
            <span>{JOB_LABEL[activeJob.kind]}</span>
            <div className="progress">
              <div style={{ width: `${activeJob.progress}%` }} />
            </div>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {activeJob.progress}% · {activeJob.message}
            </span>
            {activeJob.kind === 'analysis' && (
              <button
                onClick={() => {
                  setAnalysisJobId(activeJob.id)
                  setAnalysisOpen(true)
                }}
              >
                Show pipeline
              </button>
            )}
            <button className="danger" onClick={() => void run(() => api.cancelJob(activeJob.id))}>
              Cancel
            </button>
          </>
        ) : (
          <JobSummary job={jobs[0]} />
        )}
      </footer>
    </div>
    <ConfirmDialog
      open={confirmDeleteId !== null}
      title="Remove this project?"
      description="Your original videos are not deleted."
      confirmLabel="Remove project"
      onCancel={() => setConfirmDeleteId(null)}
      onConfirm={() => {
        const id = confirmDeleteId
        setConfirmDeleteId(null)
        if (id) void deleteProject(id)
      }}
    />
    </>
  )
}

function JobSummary({ job }: { job: Job | undefined }) {
  if (!job) return <span className="muted">No jobs yet.</span>
  const failed = job.status === 'failed' || job.status === 'interrupted'
  return (
    <span className="muted" style={{ color: failed ? 'var(--danger)' : undefined }}>
      Last job: {job.kind} — {job.status}. {job.error ?? job.message}
    </span>
  )
}

function AiPanel({
  project,
  source,
  hasKey,
  busy,
  onStarted,
  onError
}: {
  project: ProjectView
  source: MediaView
  hasKey: boolean
  busy: boolean
  onStarted: (job: Job) => void
  onError: (t: string) => void
}) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [count, setCount] = useState(3)
  const [minSec, setMinSec] = useState(30)
  const [maxSec, setMaxSec] = useState(60)
  const [ratio, setRatio] = useState<Ratio>('9:16')
  const [sceneDetection, setSceneDetection] = useState<SceneDetection>('full')

  const lengthOk = minSec >= 10 && maxSec <= 90 && minSec <= maxSec
  const duration = source.probe.durationSec
  const estFrames = Math.min(40, Math.max(8, Math.ceil(duration / 30)))

  const analyze = async (): Promise<void> => {
    try {
      const job = await api.startAnalysis({
        projectId: project.id,
        sourceId: source.id,
        prompt,
        count,
        minSec,
        maxSec,
        ratio,
        sceneDetection
      })
      onStarted(job)
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <div className="card stack">
      <h2>AI shorts from {source.name}</h2>
      <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="grid2">
        <label>
          Shorts to find (1–5)
          <input type="number" min={1} max={5} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <Select
          label="Output ratio"
          value={ratio}
          options={RATIO_OPTIONS}
          onChange={(v) => setRatio(v as Ratio)}
        />
        <Select
          label="Scene detection"
          value={sceneDetection}
          options={SCENE_OPTIONS}
          onChange={(v) => setSceneDetection(v as SceneDetection)}
        />
        <label>
          Min length (s)
          <input type="number" min={10} max={90} value={minSec} onChange={(e) => setMinSec(Number(e.target.value))} />
        </label>
        <label>
          Max length (s)
          <input type="number" min={10} max={90} value={maxSec} onChange={(e) => setMaxSec(Number(e.target.value))} />
        </label>
      </div>
      {!lengthOk && <div className="notice error">Lengths must be 10–90s, with min ≤ max.</div>}
      <div className="muted">
        Sends about {estFrames} small frames (512px wide) with timestamps to Anthropic, plus speech excerpts when the
        footage has talking. Transcription and scene detection run on this machine; the full video never leaves it.
      </div>
      <div className="row">
        <button
          className="primary"
          disabled={!hasKey || !lengthOk || busy || source.missing}
          onClick={() => void analyze()}
        >
          Analyze with AI
        </button>
        {!hasKey && <span className="muted">Add an API key in Tools ▸ Settings to enable.</span>}
        {busy && <span className="muted">Another job is running.</span>}
      </div>
    </div>
  )
}
