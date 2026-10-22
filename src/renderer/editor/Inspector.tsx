import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { segmentsDuration, type Caption, type Ratio, type Segment } from '../../shared/timeline'
import type { Short, ShortSettings } from '../../shared/types'
import { errorText } from '../util'
import { Checkbox } from '../ui/Checkbox'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import type { useShortDraft } from './useShortDraft'
import styles from './Inspector.module.css'

const api = window.studio

export type ShortDraft = ReturnType<typeof useShortDraft>

export interface InspectorProps {
  short: Short
  draft: ShortDraft
  projectId: string
  hasAudio: boolean
  musicFolderSet: boolean
  onSave: () => void
  onDeleted: () => void
  onSaved: (s: Short) => void
  onError: (t: string) => void
  onNotice: (t: string) => void
}

type Tab = 'cuts' | 'frame' | 'text' | 'audio'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cuts', label: 'Cuts' },
  { id: 'frame', label: 'Frame' },
  { id: 'text', label: 'Text' },
  { id: 'audio', label: 'Audio' }
]

const RATIO_OPTIONS = [
  { value: '9:16', label: '9:16 vertical' },
  { value: '1:1', label: '1:1 square' },
  { value: '16:9', label: '16:9 landscape' },
  { value: 'original', label: 'Original' }
]

const FIT_OPTIONS = [
  { value: 'crop', label: 'Fill (crop)' },
  { value: 'fit', label: 'Fit with black bars' }
]

/** Right-hand inspector for the selected short: tabbed controls plus a save bar that is always visible. */
export function Inspector(props: InspectorProps) {
  const { short, draft, projectId, onSave, onDeleted, onSaved, onError, onNotice } = props
  const [tab, setTab] = useState<Tab>('cuts')

  return (
    <div className={styles.inspector}>
      <input type="text" aria-label="Short title" value={draft.title} onChange={(e) => draft.setTitle(e.target.value)} />

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className={styles.root}>
        <Tabs.List className={styles.tabs} aria-label="Inspector sections">
          {TABS.map((t) => (
            <Tabs.Trigger key={t.id} value={t.id} className={styles.tab}>
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Panels stay mounted and are hidden, so a narration recording survives switching tabs. */}
        <div className={styles.body}>
          <Tabs.Content value="cuts" forceMount hidden={tab !== 'cuts'}>
            <CutsPanel segments={draft.segments} setSegments={draft.setSegments} problem={draft.problem} />
          </Tabs.Content>
          <Tabs.Content value="frame" forceMount hidden={tab !== 'frame'}>
            <FramePanel settings={draft.settings} setSettings={draft.setSettings} />
          </Tabs.Content>
          <Tabs.Content value="text" forceMount hidden={tab !== 'text'}>
            <TextPanel settings={draft.settings} setSettings={draft.setSettings} captions={draft.captions} setCaptions={draft.setCaptions} />
          </Tabs.Content>
          <Tabs.Content value="audio" forceMount hidden={tab !== 'audio'}>
            <AudioPanel
              settings={draft.settings}
              setSettings={draft.setSettings}
              hasAudio={props.hasAudio}
              musicFolderSet={props.musicFolderSet}
              short={short}
              projectId={projectId}
              onSaved={onSaved}
              onError={onError}
              onNotice={onNotice}
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <div className={styles.footer}>
        <button className="primary" disabled={!draft.dirty || draft.problem !== null} onClick={onSave}>
          Save changes
        </button>
        <button className="danger" onClick={onDeleted}>
          Delete
        </button>
        {draft.dirty && <span className={styles.unsaved}>Unsaved</span>}
      </div>
    </div>
  )
}

function CutsPanel({
  segments,
  setSegments,
  problem
}: {
  segments: Segment[]
  setSegments: Dispatch<SetStateAction<Segment[]>>
  problem: string | null
}) {
  const setSeg = (i: number, patch: Partial<Segment>): void =>
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="stack">
      <span className="muted">Cuts (source timestamps)</span>
      {segments.map((seg, i) => (
        <div key={i} className={styles.segmentRow}>
          <label>
            Start
            <input type="number" step={0.1} value={seg.startSec} onChange={(e) => setSeg(i, { startSec: Number(e.target.value) })} />
          </label>
          <label>
            End
            <input type="number" step={0.1} value={seg.endSec} onChange={(e) => setSeg(i, { endSec: Number(e.target.value) })} />
          </label>
          <button
            className="danger"
            aria-label={`Remove cut ${i + 1}`}
            disabled={segments.length === 1}
            onClick={() => setSegments(segments.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="row">
        <button disabled={segments.length >= 6} onClick={() => setSegments([...segments, { startSec: 0, endSec: 5 }])}>
          Add cut
        </button>
        <span className="muted mono">Total {segmentsDuration(segments).toFixed(1)}s</span>
      </div>
      {problem && <div className="notice error">{problem}</div>}
    </div>
  )
}

function FramePanel({
  settings,
  setSettings
}: {
  settings: ShortSettings
  setSettings: Dispatch<SetStateAction<ShortSettings>>
}) {
  return (
    <div className="stack">
      <Select
        label="Aspect ratio"
        value={settings.ratio}
        options={RATIO_OPTIONS}
        onChange={(v) => setSettings({ ...settings, ratio: v as Ratio })}
      />
      <Select
        label="Fit"
        value={settings.framing.mode}
        options={FIT_OPTIONS}
        onChange={(v) => setSettings({ ...settings, framing: { ...settings.framing, mode: v as 'crop' | 'fit' } })}
      />
      {settings.framing.mode === 'crop' && (
        <div className="grid2">
          <label>
            Horizontal <span className="mono">{settings.framing.x.toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.01} value={settings.framing.x} onChange={(e) => setSettings({ ...settings, framing: { ...settings.framing, x: Number(e.target.value) } })} />
          </label>
          <label>
            Vertical <span className="mono">{settings.framing.y.toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.01} value={settings.framing.y} onChange={(e) => setSettings({ ...settings, framing: { ...settings.framing, y: Number(e.target.value) } })} />
          </label>
        </div>
      )}
    </div>
  )
}

function TextPanel({
  settings,
  setSettings,
  captions,
  setCaptions
}: {
  settings: ShortSettings
  setSettings: Dispatch<SetStateAction<ShortSettings>>
  captions: Caption[]
  setCaptions: Dispatch<SetStateAction<Caption[]>>
}) {
  const patchCaption = (i: number, patch: Partial<Caption>): void =>
    setCaptions((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  return (
    <div className="stack">
      <Switch checked={settings.captionsEnabled} onChange={(v) => setSettings({ ...settings, captionsEnabled: v })}>
        Burn in captions
      </Switch>
      {settings.captionsEnabled && (
        <>
          <label>
            Font size <span className="mono">{settings.captionFontSize}px</span>
            <input type="range" min={36} max={120} value={settings.captionFontSize} onChange={(e) => setSettings({ ...settings, captionFontSize: Number(e.target.value) })} />
          </label>
          {captions.map((c, i) => (
            <div key={i} className={styles.captionRow}>
              <input type="number" step={0.1} aria-label="Caption start" value={c.startSec} onChange={(e) => patchCaption(i, { startSec: Number(e.target.value) })} />
              <input type="number" step={0.1} aria-label="Caption end" value={c.endSec} onChange={(e) => patchCaption(i, { endSec: Number(e.target.value) })} />
              <input type="text" aria-label="Caption text" value={c.text} onChange={(e) => patchCaption(i, { text: e.target.value })} />
              <button className="danger" aria-label="Remove caption" onClick={() => setCaptions(captions.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button onClick={() => setCaptions([...captions, { startSec: 0, endSec: 2, text: 'New caption' }])}>Add caption</button>
          <span className="muted">Times are source timestamps; they are remapped to the cut order on export.</span>
        </>
      )}
    </div>
  )
}

function AudioPanel({
  settings,
  setSettings,
  hasAudio,
  musicFolderSet,
  short,
  projectId,
  onSaved,
  onError,
  onNotice
}: {
  settings: ShortSettings
  setSettings: Dispatch<SetStateAction<ShortSettings>>
  hasAudio: boolean
  musicFolderSet: boolean
  short: Short
  projectId: string
  onSaved: (s: Short) => void
  onError: (t: string) => void
  onNotice: (t: string) => void
}) {
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)

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
    <div className="stack">
      <Switch
        checked={settings.musicEnabled}
        disabled={!musicFolderSet}
        onChange={(v) => setSettings({ ...settings, musicEnabled: v })}
      >
        Music bed {musicFolderSet ? '(from your music folder)' : '(choose a folder in Settings)'}
      </Switch>
      {settings.musicEnabled && (
        <>
          <label>
            Music volume <span className="mono">{Math.round(settings.musicVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.01} value={settings.musicVolume} onChange={(e) => setSettings({ ...settings, musicVolume: Number(e.target.value) })} />
          </label>
          <Checkbox checked={settings.musicDuck} onChange={(v) => setSettings({ ...settings, musicDuck: v })}>
            Duck music under speech
          </Checkbox>
        </>
      )}
      {!hasAudio && <span className="muted">Source has no audio; music will be the only sound.</span>}

      <span className="label">Narration {short.narrationPath ? '· recorded' : ''}</span>
      <div className="row">
        {recording ? (
          <button className="danger" onClick={stopRecording}>Stop recording</button>
        ) : (
          <button onClick={() => void startRecording()}>Record narration</button>
        )}
        {short.narrationPath && <button onClick={() => void clearNarration()}>Remove narration</button>}
      </div>
    </div>
  )
}
