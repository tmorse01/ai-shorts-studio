import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectView } from '../shared/api'
import type { Ratio } from '../shared/timeline'
import type { ExportPrefs, Job, SettingsView, Short } from '../shared/types'
import { ShortFocus } from './editor/ShortFocus'
import { ConfirmDialog } from './chrome/ConfirmDialog'
import { ProjectSidebar } from './chrome/ProjectSidebar'
import { TitleBar } from './chrome/TitleBar'
import { VideoPlayer } from './player/VideoPlayer'
import { Select } from './ui/Select'
import { ExportDialog } from './export/ExportDialog'
import { ExportProgressDialog } from './export/ExportProgressDialog'
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

const DEFAULT_PROMPT ='Find the three best action moments and make 30–60-second vertical shorts.'

export default function App() {
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [shorts, setShorts] = useState<Short[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const [newName, setNewName] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [markIn, setMarkIn] = useState<number | null>(null)
  const [markOut, setMarkOut] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [exportView, setExportView] = useState<'settings' | 'progress' | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [exportStarting, setExportStarting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const projectIdRef = useRef<string | null>(null)

  const project = projects.find((p) => p.id === projectId) ?? null
  const selected = shorts.find((s) => s.id === selectedId) ?? null
  const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'queued') ?? null

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

  useEffect(() => {
    void refreshShorts(projectId)
    setSelectedId(null)
    setChecked(new Set())
    setMarkIn(null)
    setMarkOut(null)
  }, [projectId, refreshShorts])

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

  const createProject = async (): Promise<void> => {
    const name = newName.trim() || `Project ${projects.length + 1}`
    const created = await run(() => api.createProject(name))
    if (created) {
      setNewName('')
      await refreshProjects()
      setProjectId(created.id)
      say('Project created. Import a video to begin.')
    }
  }

  const importVideo = async (relink: boolean): Promise<void> => {
    if (!projectId) return
    const updated = await run(() => (relink ? api.relinkMedia(projectId) : api.importMedia(projectId)))
    if (updated) {
      await refreshProjects()
      say(`Loaded ${updated.name}: ${updated.probe?.width}×${updated.probe?.height}, ${fmt(updated.probe?.durationSec ?? 0)}.`)
    }
  }

  const addManualShort = async (): Promise<void> => {
    if (!projectId || markIn === null || markOut === null) return
    const created = await run(() => api.createShort(projectId, [{ startSec: markIn, endSec: markOut }]))
    if (created) {
      await refreshShorts(projectId)
      setSelectedId(created.id)
      setMarkIn(null)
      setMarkOut(null)
      say(`Added "${created.title}".`)
    }
  }

  const selectShort = (id: string | null): void => setSelectedId(id)

  const toggleChecked = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const checkedShorts = shorts.filter((s) => checked.has(s.id))
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

  const hasKey = settings?.hasApiKey ?? false
  const sourceReady = Boolean(project?.sourcePath && !project.sourceMissing)

  return (
    <>
    <TitleBar
      projectName={project?.name ?? null}
      sourceMissing={Boolean(project?.sourceMissing)}
      jobLabel={activeJob ? JOB_LABEL[activeJob.kind] : null}
      jobProgress={activeJob?.progress ?? 0}
    />
    <div className="layout">
      <ProjectSidebar
        projects={projects}
        projectId={projectId}
        newName={newName}
        onNewNameChange={setNewName}
        onSelectProject={setProjectId}
        onCreateProject={() => void createProject()}
        project={project}
        onImport={(relink) => void importVideo(relink)}
        onDeleteProject={(id) => setConfirmDeleteId(id)}
        settings={settings}
        onSettingsChange={setSettings}
        onPickMusic={() =>
          void run(async () => {
            setSettings(await api.pickMusicFolder())
            say('Music folder updated. Enable music per short in the editor.')
          })
        }
        onError={(t) => say(t, true)}
        shorts={shorts}
        selectedId={selectedId}
        checked={checked}
        exportBusy={activeJob !== null}
        onSelectShort={(id) => selectShort(id)}
        onToggleChecked={toggleChecked}
        onExport={() => setExportView('settings')}
      />

      {selected && project && sourceReady ? (
        <ShortFocus
          key={selected.id}
          short={selected}
          project={project}
          musicFolderSet={Boolean(settings?.musicFolder)}
          notice={notice}
          videoRef={videoRef}
          currentTime={currentTime}
          onTimeUpdate={onTimeUpdate}
          onSeek={(sec) => {
            if (videoRef.current) videoRef.current.currentTime = sec
          }}
          onBack={() => selectShort(null)}
          onSaved={(updated) => setShorts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
          onDeleted={() => {
            void run(async () => {
              await api.deleteShort(selected.id)
              selectShort(null)
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
          <div className="empty">Create or select a project to start.</div>
        ) : !sourceReady ? (
          <div className="empty">
            <div>
              <div style={{ color: 'var(--text)', marginBottom: 6 }}>No video loaded</div>
              Import a video from the left panel to preview and clip it.
            </div>
          </div>
        ) : (
          <>
            <VideoPlayer
              ref={videoRef}
              src={api.mediaUrl(project.id)}
              durationSec={project.probe?.durationSec ?? 0}
              label="Source video"
              marks={{ inSec: markIn, outSec: markOut }}
              onTimeUpdate={onTimeUpdate}
            />
            <div className="row">
              <span className="muted">{fmt(currentTime)} / {fmt(project.probe?.durationSec ?? 0)}</span>
              <button onClick={() => setMarkIn(currentTime)}>Set in {markIn !== null ? `(${fmt(markIn)})` : ''}</button>
              <button onClick={() => setMarkOut(currentTime)}>Set out {markOut !== null ? `(${fmt(markOut)})` : ''}</button>
              <button
                className="primary"
                disabled={markIn === null || markOut === null || markOut <= markIn}
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

            <AiPanel
              project={project}
              hasKey={hasKey}
              busy={activeJob !== null}
              onStarted={(job) => {
                setJobs((prev) => [job, ...prev])
                say('Analysis started. Progress shows in the bar below.')
              }}
              onError={(t) => say(t, true)}
            />
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
      description="Your original video file is not deleted."
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

  async function deleteProject(id: string): Promise<void> {
    const ok = await run(async () => {
      await api.deleteProject(id)
      return true
    })
    if (ok) {
      setProjectId(null)
      await refreshProjects()
      say('Project removed. Your source video was not touched.')
    }
  }
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
  hasKey,
  busy,
  onStarted,
  onError
}: {
  project: ProjectView
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

  const lengthOk = minSec >= 10 && maxSec <= 90 && minSec <= maxSec
  const duration = project.probe?.durationSec ?? 0
  const estFrames = Math.min(40, Math.max(8, Math.ceil(duration / 30)))

  const analyze = async (): Promise<void> => {
    try {
      const job = await api.startAnalysis({ projectId: project.id, prompt, count, minSec, maxSec, ratio })
      onStarted(job)
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <div className="card stack">
      <h2>AI shorts</h2>
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
          disabled={!hasKey || !lengthOk || busy || !project.sourcePath || project.sourceMissing}
          onClick={() => void analyze()}
        >
          Analyze with AI
        </button>
        {!hasKey && <span className="muted">Add an API key in Settings to enable.</span>}
        {busy && <span className="muted">Another job is running.</span>}
      </div>
    </div>
  )
}
