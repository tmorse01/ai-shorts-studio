import type { JSX } from 'react'
import { Plus } from 'lucide-react'
import { addTextClip } from '@shared/timeline/edits'
import { TEXT_PRESETS, textPresetClip, type TextPreset } from '@shared/text/textPresets'
import { Button } from '@renderer/ui/Button'
import { DropdownMenu } from '@renderer/ui/DropdownMenu'
import { layerSelectionStore } from '../compositor/layerSelectionStore'
import { playbackStore } from '../playback/playbackStore'
import { applyProjectCommand } from '../shorts/shortActions'
import { timelineCommand } from '../timeline/timelineCommands'
import styles from './TextPanel.module.css'

export interface TextPanelProps {
  shortId?: string
}

// The Text panel (Epic 13, #127). Its Add menu lays a template preset (title card, lower third or call to
// action) on a text track at the playhead, and selects the new clip so the inspector can edit it.
export function TextPanel({ shortId }: TextPanelProps): JSX.Element {
  const items = TEXT_PRESETS.map((preset) => ({
    label: preset.label,
    detail: `${(preset.durationMs / 1000).toFixed(1)} s`,
    disabled: shortId === undefined,
    onSelect: () => {
      if (shortId) addPreset(shortId, preset)
    }
  }))
  return (
    <div className={styles.panel}>
      <DropdownMenu
        align="start"
        items={items}
        trigger={
          <Button variant="primary" disabled={shortId === undefined}>
            <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
            Add text
          </Button>
        }
      />
      <p className={styles.hint}>
        Presets land on a text track at the playhead. Double-click text on the frame to edit it.
      </p>
    </div>
  )
}

// Adds a preset as one history entry, at the playhead, and selects the new clip.
function addPreset(shortId: string, preset: TextPreset): void {
  const startMs = Math.round(playbackStore.getState().playheadMs)
  const clipId = crypto.randomUUID()
  applyProjectCommand(
    timelineCommand(
      shortId,
      `Add ${preset.label.toLowerCase()}`,
      new Date().toISOString(),
      (timeline) => addTextClip(timeline, textPresetClip(preset, clipId, startMs), crypto.randomUUID())
    )
  )
  layerSelectionStore.getState().select(clipId)
}
