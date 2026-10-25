import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { MediaRef } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { Select, type SelectOption } from '@renderer/ui/Select'
import { toast } from '../toasts/toast'
import { useProjectStore } from '../project/useProjectStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { useInspectorStore } from '../inspector/useInspectorStore'
import type { NarrationClipTarget } from '../inspector/inspectorStore'
import type { TtsVoice } from '@shared/tts/speech'
import {
  narrationFieldsFor,
  narrationSourceLabel,
  regenerateRequestFor,
  updateClipNarration,
  type RegenerateRequest
} from './narrationClipEdits'
import { regenerateNarrationCommand } from './narrationSectionCommands'
import styles from './NarrationSection.module.css'

const LINE_PREVIEW_CHARS = 48
const NO_LINE = 'none'

// The inspector's narration section (Epic 10, #116), in the Audio tab. It edits the one selected narration
// clip: where its voice came from, the script line it reads, its voice, its text, and regenerating its audio
// with text to speech. Volume and fades are the Clip audio section's controls, which already edit every audio
// clip, narration included.
export function NarrationSection(): JSX.Element {
  const target = useInspectorStore((state) => state.narrationTarget)
  if (!target) {
    return (
      <p className={styles.empty}>
        Select a narration clip to see its script line, voice and text.
      </p>
    )
  }
  return <NarrationForm key={target.clip.id} target={target} />
}

interface NarrationFormProps {
  target: NarrationClipTarget
}

function NarrationForm({ target }: NarrationFormProps): JSX.Element {
  const { shortId, clip, apply } = target
  const narration = clip.narration
  const folderPath = useProjectStore((state) => state.current?.folderPath)
  const project = useProjectStore((state) => state.current?.project)
  const [draft, setDraft] = useState(narration?.text ?? '')
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fields = narration ? narrationFieldsFor(narration) : []
  const showsVoice = fields.includes('voice')

  // The voices come from the provider, so they are loaded only for a text to speech clip. Without a key the
  // request fails, and the section says so rather than showing an empty list.
  useEffect(() => {
    if (!showsVoice || !folderPath) return
    let current = true
    void window.api.invoke('tts:voices', { projectFolder: folderPath }).then((result) => {
      if (!current) return
      if (result.ok) {
        setVoices(result.data.voices)
        setVoiceError(null)
      } else {
        setVoiceError(result.error.message)
      }
    })
    return () => {
      current = false
    }
  }, [showsVoice, folderPath])

  if (!narration) return <p className={styles.empty}>This clip has no narration details.</p>

  const short = project?.shorts.find((item) => item.id === shortId)
  const script = project?.scripts.find((item) => item.id === short?.scriptId)
  const lineOptions: SelectOption[] = [
    { value: NO_LINE, label: 'Not linked' },
    ...(script?.lines ?? []).map((line, index) => ({
      value: line.id,
      label: linePreview(index, line.text)
    }))
  ]

  const voiceOptions: SelectOption[] = voices.map((voice) => ({
    value: voice.id,
    label: voice.name
  }))
  if (narration.voiceId && !voices.some((voice) => voice.id === narration.voiceId)) {
    voiceOptions.push({ value: narration.voiceId, label: 'Saved voice' })
  }

  function commitText() {
    const trimmed = draft.trim()
    if (trimmed === (narration?.text ?? '').trim() || trimmed === '') {
      setDraft(narration?.text ?? '')
      return
    }
    apply(
      'Edit narration text',
      (timeline) => updateClipNarration(timeline, clip.id, { text: draft }),
      `narration-text:${clip.id}`
    )
  }

  // The request uses the text in the box, so a regenerate right after typing speaks the new words.
  const request = regenerateRequestFor(folderPath ?? '', { ...narration, text: draft })

  async function regenerate(next: RegenerateRequest) {
    setBusy(true)
    try {
      const generated = await window.api.invoke('tts:generate', next)
      if (!generated.ok) {
        toast.error({
          title: 'Could not make the narration',
          description: generated.error.message,
          details: generated.error.details
        })
        return
      }
      const audioPath = generated.data.audioPath
      const stat = await window.api.invoke('media:stat', { paths: [audioPath] })
      if (!stat.ok || stat.data.files.length === 0) {
        toast.error({ title: 'Could not read the new narration', description: audioPath })
        return
      }
      const probe = await window.api.invoke('media:probe', { path: audioPath })
      if (!probe.ok) {
        toast.error({ title: 'Could not read the new narration', description: probe.error.message })
        return
      }
      const file = stat.data.files[0]
      const durationMs = Math.round(probe.data.durationSec * 1000)
      const media: MediaRef = {
        id: crypto.randomUUID(),
        path: audioPath,
        pathKind: 'absolute',
        fileName: file.fileName,
        sizeBytes: file.sizeBytes,
        durationMs,
        kind: 'audio'
      }
      applyProjectCommand(
        regenerateNarrationCommand({
          shortId,
          clipId: clip.id,
          now: new Date().toISOString(),
          media,
          durationMs,
          voiceId: next.voiceId,
          text: next.text
        })
      )
      toast.success({
        title: generated.data.cached ? 'Narration audio reused' : 'Narration regenerated',
        description: file.fileName
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.body}>
      {fields.includes('source') ? (
        <Field label="Source">
          <span className={styles.value}>{narrationSourceLabel(narration.source)}</span>
        </Field>
      ) : null}
      {fields.includes('scriptLine') ? (
        <Field label="Script line">
          <Select
            aria-label="Linked script line"
            options={lineOptions}
            value={narration.scriptLineId ?? NO_LINE}
            disabled={!script}
            onValueChange={(value) =>
              apply('Link script line', (timeline) =>
                updateClipNarration(timeline, clip.id, {
                  scriptLineId: value === NO_LINE ? null : value
                })
              )
            }
          />
          {script ? null : <p className={styles.hint}>This short has no script to link to.</p>}
        </Field>
      ) : null}
      {showsVoice ? (
        <Field label="Voice">
          <Select
            aria-label="Narration voice"
            options={voiceOptions}
            value={narration.voiceId}
            placeholder={voiceError ? 'Voices unavailable' : 'Choose a voice'}
            disabled={voiceOptions.length === 0 || busy}
            onValueChange={(value) =>
              apply('Change narration voice', (timeline) =>
                updateClipNarration(timeline, clip.id, { voiceId: value })
              )
            }
          />
          {voiceError ? <p className={styles.error}>{voiceError}</p> : null}
        </Field>
      ) : null}
      {fields.includes('text') ? (
        <Field label="Text">
          <textarea
            aria-label="Narration text"
            className={styles.text}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitText}
          />
        </Field>
      ) : null}
      {fields.includes('regenerate') ? (
        <Field label="Audio">
          <Button
            variant="secondary"
            disabled={!request || busy}
            onClick={() => {
              if (request) void regenerate(request)
            }}
          >
            {busy ? 'Making the narration' : 'Regenerate narration'}
          </Button>
          {request ? null : (
            <p className={styles.hint}>
              {narration.voiceId
                ? 'Add some text to make the audio.'
                : 'Choose a voice to make the audio.'}
            </p>
          )}
        </Field>
      ) : null}
    </div>
  )
}

function linePreview(index: number, text: string): string {
  const words = text.trim()
  const shown =
    words.length > LINE_PREVIEW_CHARS ? `${words.slice(0, LINE_PREVIEW_CHARS).trimEnd()}...` : words
  return shown ? `${index + 1}. ${shown}` : `Line ${index + 1}`
}

interface FieldProps {
  label: string
  children: ReactNode
}

// One labelled row, styled like the other inspector rows.
function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}
