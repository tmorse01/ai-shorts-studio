import { useEffect, type JSX } from 'react'
import { useStore } from 'zustand'
import type { MediaRef, Project, Short } from '@shared/project/schema'
import {
  EXPORT_EXTENSION,
  EXPORT_FPS_OPTIONS,
  EXPORT_PRESETS,
  estimateExport,
  exportFileName,
  exportPreset,
  formatBytes,
  formatEncodeTime,
  renderExportName,
  type ExportFps,
  type ExportPresetId
} from '@shared/export/exportSettings'
import { timelineDurationMs } from '@shared/timeline/resolveFrame'
import { Button } from '@renderer/ui/Button'
import { Input } from '@renderer/ui/Input'
import { Select } from '@renderer/ui/Select'
import { Switch } from '@renderer/ui/Switch'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { editorHistory } from '../history/editorHistory'
import { pickFolder } from '../dashboard/projectActions'
import { playbackStore } from '../playback/playbackStore'
import { useProjectStore } from '../project/useProjectStore'
import { projectStore } from '../project/projectStore'
import { useShortPosters } from '../shorts/useShortPosters'
import { toast } from '../toasts/toast'
import { exportStore } from './exportStore'
import { ExportQueuePanel } from './ExportQueuePanel'
import { renderQueueStore } from './renderQueueStore'
import styles from './ExportPanel.module.css'

const NO_SHORTS: Short[] = []
const NO_MEDIA: MediaRef[] = []

const PRESET_OPTIONS = EXPORT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))
const FPS_OPTIONS = EXPORT_FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }))

// The export screen (DESIGN.md section 12), in the left pane under the Export button. It exports the
// open short. Presets, naming and the output folder are shared settings, so they apply to every short.
export function ExportPanel(): JSX.Element {
  const activeId = useStore(editorHistory.selection, (state) => state.activeId)
  const project: Project | undefined = useProjectStore((state) => state.current?.project)
  const folderPath = useProjectStore((state) => state.current?.folderPath ?? null)
  const media = useProjectStore((state) => state.current?.project.media ?? NO_MEDIA)
  const shorts = project?.shorts ?? NO_SHORTS
  const short = shorts.find((item) => item.id === activeId)
  const posters = useShortPosters(folderPath, short ? [short] : NO_SHORTS, media)

  const encoder = useStore(exportStore, (state) => state.encoder)
  const settings = useStore(exportStore, (state) => state.settings)
  const loaded = useStore(exportStore, (state) => state.loaded)

  useEffect(() => {
    void exportStore.getState().load()
  }, [])

  if (!project || !short) {
    return <EmptyState title="No short open" description="Open a short to export it." />
  }

  const { update } = exportStore.getState()
  const preset = exportPreset(settings.presetId)
  const index = shorts.indexOf(short) + 1
  const baseName = renderExportName(settings.namingTemplate, {
    project: project.name,
    short: short.name,
    index,
    preset: preset.label
  })
  const durationMs = timelineDurationMs(short.timeline)
  const estimate = estimateExport(durationMs, preset, encoder?.hardware ?? false)
  const poster = posters[short.id]
  const readyIds = shorts.filter((item) => item.status === 'ready').map((item) => item.id)

  // Saves pending edits first, so the export renders the timeline the user sees.
  async function exportShorts(shortIds: string[]): Promise<void> {
    if (!folderPath || shortIds.length === 0) return
    await projectStore.getState().flush()
    await renderQueueStore.getState().start(folderPath, shortIds)
  }

  async function chooseFolder(): Promise<void> {
    const picked = await pickFolder()
    if (picked) update({ outputFolder: picked })
  }

  function editThumbnail(): void {
    playbackStore.getState().seek(short?.posterMs ?? 0)
    toast.info({
      title: 'Showing the poster frame',
      description: 'Move the playhead, then use Set as poster in the editor to change it.'
    })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.preview}>
        {poster ? (
          <img className={styles.poster} src={poster} alt={`Poster for ${short.name}`} />
        ) : (
          <p className={styles.noPoster}>No poster frame yet</p>
        )}
        <Button variant="ghost" size="sm" className={styles.editThumb} onClick={editThumbnail}>
          Edit thumbnail
        </Button>
      </div>

      <section className={styles.card} aria-label="Export settings">
        <Select
          aria-label="Preset"
          options={PRESET_OPTIONS}
          value={settings.presetId}
          onValueChange={(value) => {
            const next = EXPORT_PRESETS.find((item) => item.id === (value as ExportPresetId))
            update({
              presetId: next?.id ?? settings.presetId,
              fps: next?.defaultFps ?? settings.fps
            })
          }}
        />
        <Select
          aria-label="Frame rate"
          options={FPS_OPTIONS}
          value={String(settings.fps)}
          onValueChange={(value) => update({ fps: Number(value) as ExportFps })}
        />
        <Switch
          checked={settings.includeCaptions}
          onCheckedChange={(checked) => update({ includeCaptions: checked })}
        >
          Include captions
        </Switch>
        <label className={styles.field}>
          <span className={styles.label}>File name</span>
          <span className={styles.nameRow}>
            <Input
              value={settings.namingTemplate}
              onChange={(event) => update({ namingTemplate: event.target.value })}
              aria-label="Naming template"
              maxLength={200}
            />
            <span className={styles.suffix}>{EXPORT_EXTENSION}</span>
          </span>
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Output folder</span>
          <span className={styles.folderRow}>
            <span className={styles.folder} title={settings.outputFolder ?? folderPath ?? ''}>
              {settings.outputFolder ?? 'Project folder'}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void chooseFolder()}>
              Choose
            </Button>
            {settings.outputFolder && (
              <Button variant="ghost" size="sm" onClick={() => update({ outputFolder: null })}>
                Reset
              </Button>
            )}
          </span>
        </div>
      </section>

      <p className={styles.summary}>
        <span>{exportFileName(baseName)}</span>
        <span>
          About {formatBytes(estimate.bytes)}, about {formatEncodeTime(estimate.seconds)} to encode
        </span>
      </p>

      <p className={styles.encoder}>
        {!loaded || !encoder
          ? 'Checking the encoder'
          : `${encoder.encoder}${encoder.hardware ? ' (hardware)' : ' (software fallback)'}, FFmpeg ${encoder.ffmpegVersion ?? 'version unknown'}`}
      </p>
      {encoder && !encoder.amixNormalizeSupported && (
        <p className={styles.warning}>
          This FFmpeg build is older than 5.0, so export audio cannot be mixed. Update the bundled
          FFmpeg.
        </p>
      )}

      <Button
        variant="primary"
        className={styles.exportButton}
        disabled={!encoder}
        onClick={() => void exportShorts([short.id])}
      >
        Export video
      </Button>
      <Button
        variant="secondary"
        className={styles.exportButton}
        disabled={!encoder || readyIds.length === 0}
        onClick={() => void exportShorts(readyIds)}
      >
        Export all Ready ({readyIds.length})
      </Button>
      <ExportQueuePanel />
    </div>
  )
}
