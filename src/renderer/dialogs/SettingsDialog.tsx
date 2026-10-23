import { useState } from 'react'
import type { SettingsView } from '../../shared/types'
import { Modal } from '../chrome/Modal'
import { errorText } from '../util'

const api = window.studio

export interface SettingsDialogProps {
  open: boolean
  settings: SettingsView | null
  onChange: (s: SettingsView) => void
  onClose: () => void
  onError: (t: string) => void
}

/** App-wide settings: the Anthropic key and whether the bundled tools are available. */
export function SettingsDialog({ open, settings, onChange, onClose, onError }: SettingsDialogProps) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      onChange(await api.setApiKey(key))
      setKey('')
    } catch (err) {
      onError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    try {
      onChange(await api.clearApiKey())
    } catch (err) {
      onError(errorText(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={saving} title="Settings" description="Applies to every project.">
      <section className="stack">
        <h2>Anthropic API key</h2>
        <div className="muted">
          {settings?.hasApiKey ? 'Saved (encrypted by Windows for this account).' : 'Not set. AI analysis needs a key.'}{' '}
          Frames and transcript excerpts are sent to Anthropic for analysis; full videos never are. Protection depends
          on your Windows account security.
        </div>
        <div className="row">
          <input
            type="text"
            aria-label="Anthropic API key"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button disabled={key.trim().length < 20 || saving} onClick={() => void save()}>
            Save key
          </button>
          {settings?.hasApiKey && (
            <button className="danger" onClick={() => void remove()}>
              Remove
            </button>
          )}
        </div>
      </section>

      <section className="stack">
        <h2>Tools</h2>
        <div className="muted">
          FFmpeg: {settings?.ffmpegAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}
        </div>
        <div className="muted">
          Speech-to-text: {settings?.speechAvailable ? 'ready' : 'missing (run pnpm fetch:bin)'}
        </div>
      </section>
    </Modal>
  )
}
