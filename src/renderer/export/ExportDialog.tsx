import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { ExportOptions } from '../../shared/schemas'
import { DEFAULT_EXPORT_OPTIONS } from '../../shared/export-math'
import { segmentsDuration } from '../../shared/timeline'
import type { ExportPrefs, Short } from '../../shared/types'
import { Checkbox } from '../ui/Checkbox'
import { Select } from '../ui/Select'
import { errorText } from '../util'
import styles from './Export.module.css'

const api = window.studio

const QUALITIES: { value: ExportOptions['quality']; label: string; hint: string }[] = [
  { value: 'high', label: 'High', hint: 'Sharpest. Largest files, slowest to export.' },
  { value: 'standard', label: 'Standard', hint: 'Balanced. Recommended for most shorts.' },
  { value: 'small', label: 'Small', hint: 'Smallest files. Fine detail may soften.' }
]

const RESOLUTIONS = [
  { value: '1080p', label: '1080p · Full HD' },
  { value: '720p', label: '720p · smaller, faster' }
]

const FPS = [
  { value: 'source', label: 'Same as source' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' }
]

const AUDIO = [
  { value: '128', label: '128 kbps' },
  { value: '160', label: '160 kbps' },
  { value: '192', label: '192 kbps' }
]

interface ExportDialogProps {
  shorts: Short[]
  /** Last-used folder and settings, pre-filled when the dialog opens. */
  initial: ExportPrefs | null
  starting: boolean
  onStart: (prefs: ExportPrefs, overwrite: boolean) => void
  onClose: () => void
  onError: (text: string) => void
}

export function ExportDialog({ shorts, initial, starting, onStart, onClose, onError }: ExportDialogProps) {
  const [outputDir, setOutputDir] = useState<string | null>(initial?.outputDir ?? null)
  const [options, setOptions] = useState<ExportOptions>(initial?.options ?? DEFAULT_EXPORT_OPTIONS)
  const [overwrite, setOverwrite] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const pickFolder = async (): Promise<void> => {
    try {
      const dir = await api.pickOutputDir()
      if (dir) setOutputDir(dir)
    } catch (err) {
      onError(errorText(err))
    }
  }

  const count = shorts.length
  const totalSec = shorts.reduce((sum, s) => sum + segmentsDuration(s.segments), 0)
  const hint = QUALITIES.find((q) => q.value === options.quality)?.hint

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !starting && onClose()}>
      <Dialog.Portal>
        {/* modal-backdrop is the marker App's keyboard shortcuts check before handling Space and arrows. */}
        <Dialog.Overlay className={`${styles.overlay} modal-backdrop`} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            Export {count} short{count === 1 ? '' : 's'}
          </Dialog.Title>
          <Dialog.Description className={styles.description}>
            These settings apply to every short in this export.
          </Dialog.Description>

          <div className={styles.body}>
            <section className={styles.section}>
              <div className={styles.sectionLabel}>Save to</div>
              <div className={styles.folderRow}>
                <span className={styles.path} title={outputDir ?? undefined}>
                  {outputDir ?? 'No folder chosen yet'}
                </span>
                <button type="button" onClick={() => void pickFolder()}>
                  {outputDir ? 'Change…' : 'Choose folder…'}
                </button>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionLabel} id="export-quality-label">
                Quality
              </div>
              <div className={styles.segmented} role="radiogroup" aria-labelledby="export-quality-label">
                {QUALITIES.map((q) => (
                  <button
                    key={q.value}
                    type="button"
                    role="radio"
                    aria-checked={options.quality === q.value}
                    className={styles.segment}
                    onClick={() => setOptions({ ...options, quality: q.value })}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className={styles.hint}>{hint}</div>
            </section>

            <div className={styles.grid}>
              <Select
                label="Resolution"
                value={options.resolution}
                options={RESOLUTIONS}
                onChange={(v) => setOptions({ ...options, resolution: v as ExportOptions['resolution'] })}
              />
            </div>

            <button
              type="button"
              className={styles.linkButton}
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced'}
            </button>
            {showAdvanced && (
              <div className={styles.grid}>
                <Select
                  label="Frame rate"
                  value={String(options.fps)}
                  options={FPS}
                  onChange={(v) => setOptions({ ...options, fps: v === 'source' ? 'source' : (Number(v) as 30 | 60) })}
                />
                <Select
                  label="Audio bitrate"
                  value={String(options.audioKbps)}
                  options={AUDIO}
                  onChange={(v) => setOptions({ ...options, audioKbps: Number(v) as ExportOptions['audioKbps'] })}
                />
              </div>
            )}

            <Checkbox checked={overwrite} onChange={setOverwrite}>
              Replace existing files with the same name
            </Checkbox>
          </div>

          <div className={styles.footer}>
            <span className={styles.summary}>
              {count} MP4 · {totalSec.toFixed(1)}s total · H.264
            </span>
            <div className={styles.footerActions}>
              <button type="button" onClick={onClose} disabled={starting}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!outputDir || starting}
                onClick={() => outputDir && onStart({ outputDir, options }, overwrite)}
              >
                {starting ? 'Starting…' : 'Export'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
