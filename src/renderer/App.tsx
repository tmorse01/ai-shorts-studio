import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectView } from '../shared/api'
import {
  validateShortDuration,
  type Caption,
  type Ratio,
  type Segment,
  normalizeSegments,
  segmentsDuration
} from '../shared/timeline'
import type { Job, SettingsView, Short, ShortSettings } from '../shared/types'

const api = window.studio

const JOB_LABEL: Record<Job['kind'], string> = {
  analysis: 'Analyzing',
  export: 'Exporting',
  proxy: 'Preparing preview'
}

const DEFAULT_PROMPT ='Find the three best action moments and make 30–60-second vertical shorts.'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

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
  const [preview, setPreview] = useState<{ segments: Segment[]; index: number } | null>(null)
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
    setPreview(null)
    setMarkIn(null)
    setMarkOut(null)
  }, [projectId, refreshShorts])

  // Keyboard: space toggles play, arrows seek. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
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
    if (!v) return
    setCurrentTime(v.currentTime)
    if (!preview) return
    const seg = preview.segments[preview.index]
    if (v.currentTime >= seg.endSec) {
      const next = (preview.index + 1) % preview.segments.length
      v.currentTime = preview.segments[next].startSec
      setPreview({ segments: preview.segments, index: next })
    }
  }

  const startPreview = (short: Short): void => {
    const v = videoRef.current
    if (!v || short.segments.length === 0) return
    v.currentTime = short.segments[0].startSec
    void v.play()
    setPreview({ segments: short.segments, index: 0 })
  }

  const stopPreview = (): void => {
    setPreview(null)
    videoRef.current?.pause()
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

  const toggleChecked = (id: string): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportChecked = async (): Promise<void> => {
    if (!projectId || checked.size === 0) return
    const outputDir = await run(() => api.pickOutputDir())
    if (!outputDir) return
    const job = await run(() => api.startExport({ projectId, shortIds: [...checked], outputDir, overwrite: false }))
    if (job) say('Export started.')
  }

  const hasKey = settings?.hasApiKey ?? false
  const sourceReady = Boolean(project?.sourcePath && !project.sourceMissing)

  return (
    <div className="layout">
      <aside className="pane">
        <h2>Projects</h2>
        <div className="stack">
          <div className="row">
            <input
              type="text"
              placeholder="New project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createProject()}
            />
            <button className="primary" onClick={() => void createProject()}>
              Add
            </button>
          </div>
          {projects.length === 0 && <div className="muted">No projects yet. Create one to begin.</div>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`card ${p.id === projectId ? 'active' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setProjectId(p.id)}
            >
              <div>{p.name}</div>
              <div className="muted">
                {p.sourcePath ? (p.sourceMissing ? 'Source missing' : 'Source linked') : 'No video yet'}
              </div>
            </div>
          ))}
        </div>

        {project && (
          <div className="stack" style={{ marginTop: 18 }}>
            <h2>Source</h2>
            {project.sourcePath ? (
              <div className="muted" style={{ wordBreak: 'break-all' }}>
                {project.sourcePath}
                {project.probe && (
                  <>
                    <br />
                    {project.probe.width}×{project.probe.height} · {fmt(project.probe.durationSec)} ·{' '}
                    {project.probe.videoCodec} · {project.probe.hasAudio ? 'audio' : 'no audio'}
                  </>
                )}
              </div>
            ) : (
              <div className="muted">Pick a local MP4 or MOV. The file stays where it is; nothing is uploaded.</div>
            )}
            {project.sourceMissing && (
              <div className="notice error">The file was moved or deleted. Relink it to keep working.</div>
            )}
            <div className="row">
              <button onClick={() => void importVideo(Boolean(project.sourcePath))}>
                {project.sourcePath ? 'Relink video…' : 'Import video…'}
              </button>
              <button className="danger" onClick={() => void deleteProject(project.id)}>
                Delete project
              </button>
            </div>
          </div>
        )}

        <div className="stack" style={{ marginTop: 18 }}>
          <h2>Settings</h2>
          <ApiKeyBox settings={settings} onChange={setSettings} onError={(t) => say(t, true)} />
          <div className="stack">
            <div className="muted">
              Music folder: {settings?.musicFolder ?? 'none set (music is optional)'}
            </div>
            <button
              onClick={() =>
                void run(async () => {
                  setSettings(await api.pickMusicFolder())
                  say('Music folder updated. Enable music per short in the editor.')
                })
              }
            >
              Choose music folder…
            </button>
          </div>
          <div className="muted">
            FFmpeg: {settings?.ffmpegAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}. Speech-to-text (local
            Whisper): {settings?.whisperAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}.
          </div>
        </div>
      </aside>

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
            <video
              ref={videoRef}
              className="player"
              src={api.mediaUrl(project.id)}
              controls
              preload="metadata"
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
        <h2>Shorts</h2>
        {!project && <div className="muted">Select a project.</div>}
        {project && shorts.length === 0 && (
          <div className="empty">No shorts yet. Run AI analysis or add a manual selection.</div>
        )}
        <div className="stack">
          {shorts.map((s) => (
            <div key={s.id} className={`card ${s.id === selectedId ? 'active' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label style={{ flexDirection: 'row', alignItems: 'center', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={checked.has(s.id)}
                    onChange={() => toggleChecked(s.id)}
                  />
                  <span style={{ cursor: 'pointer' }} onClick={() => setSelectedId(s.id)}>
                    {s.rank !== null && <span className="muted">#{s.rank} </span>}
                    {s.title}
                  </span>
                </label>
                <span className={`badge ${s.provenance}`}>{s.provenance === 'ai' ? 'AI-selected' : s.provenance}</span>
              </div>
              <div className="muted">
                {s.segments.length} cut{s.segments.length === 1 ? '' : 's'} · {segmentsDuration(s.segments).toFixed(1)}s
                {s.exportedPath && ' · exported'}
              </div>
              {s.reason && <div className="muted" style={{ marginTop: 4 }}>{s.reason}</div>}
            </div>
          ))}
        </div>

        {selected && project && (
          <ShortEditor
            key={selected.id}
            short={selected}
            projectId={project.id}
            durationSec={project.probe?.durationSec ?? 0}
            hasAudio={project.probe?.hasAudio ?? false}
            musicFolderSet={Boolean(settings?.musicFolder)}
            previewing={preview !== null}
            onPreview={() => startPreview(selected)}
            onStopPreview={stopPreview}
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
        )}

        {project && shorts.length > 0 && (
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="muted">{checked.size} selected for export</div>
            <button className="primary" disabled={checked.size === 0 || activeJob !== null} onClick={() => void exportChecked()}>
              Export selected…
            </button>
          </div>
        )}
      </aside>

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
  )

  async function deleteProject(id: string): Promise<void> {
    if (!window.confirm('Remove this project? Your original video file is not deleted.')) return
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
        <label>
          Output ratio
          <select value={ratio} onChange={(e) => setRatio(e.target.value as Ratio)}>
            <option value="9:16">9:16 vertical</option>
            <option value="1:1">1:1 square</option>
            <option value="16:9">16:9 landscape</option>
            <option value="original">Original</option>
          </select>
        </label>
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

function ShortEditor({
  short,
  projectId,
  durationSec,
  hasAudio,
  musicFolderSet,
  previewing,
  onPreview,
  onStopPreview,
  onSaved,
  onDeleted,
  onError,
  onNotice
}: {
  short: Short
  projectId: string
  durationSec: number
  hasAudio: boolean
  musicFolderSet: boolean
  previewing: boolean
  onPreview: () => void
  onStopPreview: () => void
  onSaved: (s: Short) => void
  onDeleted: () => void
  onError: (t: string) => void
  onNotice: (t: string) => void
}) {
  const [title, setTitle] = useState(short.title)
  const [segments, setSegments] = useState<Segment[]>(short.segments)
  const [captions, setCaptions] = useState<Caption[]>(short.captions)
  const [settings, setSettings] = useState<ShortSettings>(short.settings)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const dirty = useMemo(
    () =>
      title !== short.title ||
      JSON.stringify(segments) !== JSON.stringify(short.segments) ||
      JSON.stringify(captions) !== JSON.stringify(short.captions) ||
      JSON.stringify(settings) !== JSON.stringify(short.settings),
    [title, segments, captions, settings, short]
  )
  const problem = validateShortDuration(segments)

  const save = async (): Promise<void> => {
    try {
      const updated = await api.updateShort(short.id, {
        title,
        segments: normalizeSegments(segments, durationSec),
        captions,
        settings
      })
      onSaved(updated)
      onNotice('Saved.')
    } catch (err) {
      onError(errorText(err))
    }
  }

  const setSeg = (i: number, patch: Partial<Segment>): void =>
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const bytes = new Uint8Array(await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer())
        try {
          onSaved(await api.saveNarration(projectId, short.id, bytes))
          onNotice('Narration saved and will be mixed over the short on export.')
        } catch (err) {
          onError(errorText(err))
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      onError('Microphone access was refused or unavailable.')
    }
  }

  const stopRecording = (): void => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  const clearNarration = async (): Promise<void> => {
    try {
      onSaved(await api.clearNarration(projectId, short.id))
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <div className="card stack" style={{ marginTop: 14 }}>
      <h2>Edit short</h2>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="stack">
        <span className="muted">Cuts (source timestamps)</span>
        {segments.map((seg, i) => (
          <div key={i} className="segment-row">
            <label>
              Start
              <input type="number" step={0.1} value={seg.startSec} onChange={(e) => setSeg(i, { startSec: Number(e.target.value) })} />
            </label>
            <label>
              End
              <input type="number" step={0.1} value={seg.endSec} onChange={(e) => setSeg(i, { endSec: Number(e.target.value) })} />
            </label>
            <button className="danger" disabled={segments.length === 1} onClick={() => setSegments(segments.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button disabled={segments.length >= 6} onClick={() => setSegments([...segments, { startSec: 0, endSec: 5 }])}>
            Add cut
          </button>
          <span className="muted">Total {segmentsDuration(segments).toFixed(1)}s</span>
        </div>
        {problem && <div className="notice error">{problem}</div>}
      </div>

      <div className="row">
        <button onClick={previewing ? onStopPreview : onPreview}>{previewing ? 'Stop preview' : 'Preview loop'}</button>
      </div>

      <div className="stack">
        <span className="muted">Framing</span>
        <select value={settings.ratio} onChange={(e) => setSettings({ ...settings, ratio: e.target.value as Ratio })}>
          <option value="9:16">9:16 vertical</option>
          <option value="1:1">1:1 square</option>
          <option value="16:9">16:9 landscape</option>
          <option value="original">Original</option>
        </select>
        <select
          value={settings.framing.mode}
          onChange={(e) => setSettings({ ...settings, framing: { ...settings.framing, mode: e.target.value as 'crop' | 'fit' } })}
        >
          <option value="crop">Fill (crop)</option>
          <option value="fit">Fit with black bars</option>
        </select>
        {settings.framing.mode === 'crop' && (
          <div className="grid2">
            <label>
              Horizontal {settings.framing.x.toFixed(2)}
              <input type="range" min={0} max={1} step={0.01} value={settings.framing.x} onChange={(e) => setSettings({ ...settings, framing: { ...settings.framing, x: Number(e.target.value) } })} />
            </label>
            <label>
              Vertical {settings.framing.y.toFixed(2)}
              <input type="range" min={0} max={1} step={0.01} value={settings.framing.y} onChange={(e) => setSettings({ ...settings, framing: { ...settings.framing, y: Number(e.target.value) } })} />
            </label>
          </div>
        )}
      </div>

      <div className="stack">
        <label style={{ flexDirection: 'row', color: 'var(--text)', alignItems: 'center' }}>
          <input type="checkbox" checked={settings.captionsEnabled} onChange={(e) => setSettings({ ...settings, captionsEnabled: e.target.checked })} />
          Burn in captions
        </label>
        {settings.captionsEnabled && (
          <>
            <label>
              Font size {settings.captionFontSize}px
              <input type="range" min={36} max={120} value={settings.captionFontSize} onChange={(e) => setSettings({ ...settings, captionFontSize: Number(e.target.value) })} />
            </label>
            {captions.map((c, i) => (
              <div key={i} className="caption-row">
                <input type="number" step={0.1} value={c.startSec} onChange={(e) => setCaptions(captions.map((x, idx) => (idx === i ? { ...x, startSec: Number(e.target.value) } : x)))} />
                <input type="number" step={0.1} value={c.endSec} onChange={(e) => setCaptions(captions.map((x, idx) => (idx === i ? { ...x, endSec: Number(e.target.value) } : x)))} />
                <input type="text" value={c.text} onChange={(e) => setCaptions(captions.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))} />
                <button className="danger" onClick={() => setCaptions(captions.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <button onClick={() => setCaptions([...captions, { startSec: 0, endSec: 2, text: 'New caption' }])}>Add caption</button>
            <span className="muted">Times are source timestamps; they are remapped to the cut order on export.</span>
          </>
        )}
      </div>

      <div className="stack">
        <label style={{ flexDirection: 'row', color: 'var(--text)', alignItems: 'center' }}>
          <input type="checkbox" checked={settings.musicEnabled} disabled={!musicFolderSet} onChange={(e) => setSettings({ ...settings, musicEnabled: e.target.checked })} />
          Music bed {musicFolderSet ? '(from your music folder)' : '(choose a folder in Settings)'}
        </label>
        {settings.musicEnabled && (
          <>
            <label>
              Music volume {Math.round(settings.musicVolume * 100)}%
              <input type="range" min={0} max={1} step={0.01} value={settings.musicVolume} onChange={(e) => setSettings({ ...settings, musicVolume: Number(e.target.value) })} />
            </label>
            <label style={{ flexDirection: 'row', color: 'var(--text)', alignItems: 'center' }}>
              <input type="checkbox" checked={settings.musicDuck} onChange={(e) => setSettings({ ...settings, musicDuck: e.target.checked })} />
              Duck music under speech
            </label>
          </>
        )}
        {!hasAudio && <span className="muted">Source has no audio; music will be the only sound.</span>}
      </div>

      <div className="stack">
        <span className="muted">Narration {short.narrationPath ? '(recorded)' : ''}</span>
        <div className="row">
          {recording ? (
            <button className="danger" onClick={stopRecording}>Stop recording</button>
          ) : (
            <button onClick={() => void startRecording()}>Record narration</button>
          )}
          {short.narrationPath && <button onClick={() => void clearNarration()}>Remove narration</button>}
        </div>
      </div>

      <div className="row">
        <button className="primary" disabled={!dirty || problem !== null} onClick={() => void save()}>
          Save changes
        </button>
        <button className="danger" onClick={onDeleted}>Delete short</button>
      </div>
      {short.exportedPath && <div className="muted" style={{ wordBreak: 'break-all' }}>Last export: {short.exportedPath}</div>}
    </div>
  )
}
