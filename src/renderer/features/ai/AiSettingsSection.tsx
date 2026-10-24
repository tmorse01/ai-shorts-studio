// The Cloud AI part of Settings: the API key (saved encrypted in main, with a test), the vision model,
// the monthly spend cap, and this month's usage. Everything it shows comes from the AI store.
import { useEffect, useState, type JSX } from 'react'
import { useStore } from 'zustand'
import {
  MAX_CAP_USD,
  VISION_MODELS,
  VISION_MODEL_LABELS,
  type VisionModel
} from '@shared/ai/aiSettings'
import { Button } from '@renderer/ui/Button'
import { Input } from '@renderer/ui/Input'
import { Select } from '@renderer/ui/Select'
import { toast } from '../toasts/toast'
import { aiStore } from './aiStore'
import { clearAiKey, refreshAiStatus, saveAiKey, testAiKey, updateAiSettings } from './aiSync'
import { capLine, keyLine, parseCapInput, usageLine } from './aiText'
import styles from './AiSettingsSection.module.css'

export function AiSettingsSection(): JSX.Element {
  const status = useStore(aiStore, (state) => state.status)
  const cap = status?.settings.monthlySpendCapUsd ?? null
  const [keyDraft, setKeyDraft] = useState('')
  const [capDraft, setCapDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    void refreshAiStatus(window.api)
  }, [])

  // The cap field follows the saved cap, so it shows what is in effect after a save.
  useEffect(() => {
    setCapDraft(cap === null ? '' : String(cap))
  }, [cap])

  if (!status) {
    return <p className={styles.muted}>Loading AI settings...</p>
  }

  async function saveKey() {
    setSaving(true)
    const saved = await saveAiKey(window.api, keyDraft.trim())
    setSaving(false)
    if (saved) {
      setKeyDraft('')
      setTestMessage(null)
    }
  }

  async function testKey() {
    setTesting(true)
    setTestMessage(await testAiKey(window.api))
    setTesting(false)
  }

  async function removeKey() {
    await clearAiKey(window.api)
    setTestMessage(null)
  }

  async function saveCap() {
    const parsed = parseCapInput(capDraft)
    if (parsed === undefined || (parsed !== null && parsed > MAX_CAP_USD)) {
      toast.error({
        title: 'Enter a monthly cap in dollars',
        description: `Use an amount above $0 and up to $${MAX_CAP_USD.toLocaleString('en-US')}, or leave it blank for no cap.`
      })
      return
    }
    await updateAiSettings(window.api, { monthlySpendCapUsd: parsed })
  }

  function changeModel(value: string) {
    const model = VISION_MODELS.find((candidate): candidate is VisionModel => candidate === value)
    if (model) void updateAiSettings(window.api, { visionModel: model })
  }

  return (
    <section className={styles.section} aria-labelledby="ai-settings-heading">
      <h2 id="ai-settings-heading" className={styles.heading}>
        Cloud AI
      </h2>
      <p className={styles.muted}>
        Footage stays on this computer. Frames go to Anthropic only when vision runs, and only after
        you confirm the cost for a project.
      </p>

      <div className={styles.field}>
        <label htmlFor="ai-api-key" className={styles.label}>
          Anthropic API key
        </label>
        <div className={styles.row}>
          <Input
            id="ai-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status.hasKey ? 'Enter a new key to replace it' : 'sk-ant-...'}
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            disabled={!status.keyStorageAvailable}
          />
          <Button
            variant="primary"
            onClick={() => void saveKey()}
            disabled={!keyDraft.trim() || !status.keyStorageAvailable}
            loading={saving}
          >
            Save key
          </Button>
        </div>
        <p className={styles.muted}>{keyLine(status)}</p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            onClick={() => void testKey()}
            disabled={!status.hasKey}
            loading={testing}
          >
            Test connection
          </Button>
          {status.hasKey && (
            <Button variant="ghost" onClick={() => void removeKey()}>
              Remove key
            </Button>
          )}
        </div>
        {testMessage && (
          <p role="status" className={testMessage.ok ? styles.ok : styles.error}>
            {testMessage.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Vision model</span>
        <Select
          aria-label="Vision model"
          options={VISION_MODELS.map((model) => ({
            value: model,
            label: VISION_MODEL_LABELS[model]
          }))}
          value={status.settings.visionModel}
          onValueChange={changeModel}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="ai-spend-cap" className={styles.label}>
          Monthly spend cap (USD)
        </label>
        <div className={styles.row}>
          <Input
            id="ai-spend-cap"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="No cap"
            value={capDraft}
            onChange={(event) => setCapDraft(event.target.value)}
          />
          <Button variant="secondary" onClick={() => void saveCap()}>
            Save cap
          </Button>
        </div>
        <p className={styles.muted}>{capLine(status)}</p>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Usage this month ({status.month})</span>
        <p className={styles.usage}>{usageLine(status)}</p>
      </div>
    </section>
  )
}
