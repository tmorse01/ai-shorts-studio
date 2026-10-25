import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTION_PRESETS } from '../src/shared/captions/captionPreset'
import type { Project } from '../src/shared/project/schema'
import {
  saveCaptionPresetCommand,
  setShortCaptionPresetCommand,
  updateCaptionPresetCommand
} from '../src/renderer/features/captions/captionPresetCommands'

const NOW = '2026-10-24T10:00:00.000Z'

function projectWith(extra: Partial<Project> = {}): Project {
  return {
    schemaVersion: 20,
    id: 'p1',
    name: 'Project',
    createdAt: NOW,
    updatedAt: NOW,
    media: [],
    mediaTags: [],
    moments: [],
    defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
    shorts: [
      {
        id: 's1',
        name: 'Short',
        createdAt: NOW,
        updatedAt: NOW,
        status: 'draft',
        order: 0,
        targetLength: { minSec: 30, maxSec: 60 },
        platform: 'generic',
        overrides: {},
        editedSinceExport: false,
        timeline: { tracks: [] }
      }
    ],
    scripts: [],
    ...extra
  }
}

describe('updateCaptionPresetCommand', () => {
  it('copies the shipped presets into the project on the first edit, then changes one field', () => {
    const next = produce(projectWith(), (draft) =>
      updateCaptionPresetCommand('classic', { sizePx: 88 }).produce(draft)
    )
    expect(next.captionPresets).toHaveLength(DEFAULT_CAPTION_PRESETS.length)
    const classic = next.captionPresets?.find((preset) => preset.id === 'classic')
    expect(classic?.sizePx).toBe(88)
    expect(classic?.fill).toBe(DEFAULT_CAPTION_PRESETS[0]?.fill)
  })

  it('removes the outline when the change sets stroke to undefined', () => {
    const next = produce(projectWith(), (draft) =>
      updateCaptionPresetCommand('classic', { stroke: undefined }).produce(draft)
    )
    expect(next.captionPresets?.find((preset) => preset.id === 'classic')?.stroke).toBeUndefined()
  })

  it('rejects a value the schema refuses and leaves the project as it was', () => {
    const project = projectWith()
    expect(() =>
      produce(project, (draft) =>
        updateCaptionPresetCommand('classic', { wordsPerCaption: 99 }).produce(draft)
      )
    ).toThrow()
    expect(project.captionPresets).toBeUndefined()
  })

  it('throws for a preset id the project does not have', () => {
    expect(() =>
      produce(projectWith(), (draft) =>
        updateCaptionPresetCommand('gone', { sizePx: 40 }).produce(draft)
      )
    ).toThrow(/no longer in the project/)
  })
})

describe('saveCaptionPresetCommand', () => {
  it('saves a named copy and selects it for the short in the same step', () => {
    const source = DEFAULT_CAPTION_PRESETS[1]
    if (!source) throw new Error('missing default preset')
    const next = produce(projectWith(), (draft) =>
      saveCaptionPresetCommand({
        id: 'mine',
        label: '  My look ',
        source,
        shortId: 's1',
        now: NOW
      }).produce(draft)
    )
    const saved = next.captionPresets?.find((preset) => preset.id === 'mine')
    expect(saved?.label).toBe('My look')
    expect(saved?.sizePx).toBe(source.sizePx)
    expect(next.shorts[0]?.captionPresetId).toBe('mine')
  })

  it('refuses an empty name', () => {
    const source = DEFAULT_CAPTION_PRESETS[0]
    if (!source) throw new Error('missing default preset')
    expect(() =>
      produce(projectWith(), (draft) =>
        saveCaptionPresetCommand({ id: 'x', label: '   ', source, now: NOW }).produce(draft)
      )
    ).toThrow(/needs a name/)
  })
})

describe('setShortCaptionPresetCommand', () => {
  it('sets the preset on that short only', () => {
    const next = produce(projectWith(), (draft) =>
      setShortCaptionPresetCommand('s1', 'bold', NOW).produce(draft)
    )
    expect(next.shorts[0]?.captionPresetId).toBe('bold')
    expect(next.captionPresets).toBeUndefined()
  })
})
