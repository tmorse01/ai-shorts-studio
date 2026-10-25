import { describe, expect, it } from 'vitest'
import { clipSchema, IDENTITY_TRANSFORM, type Clip, type Timeline } from '@shared/timeline/timeline'
import { textItemSchema, type TextItem } from '@shared/text/textItem'
import {
  TEXT_PRESETS,
  applyTextPresetLook,
  matchTextPreset,
  presetItem,
  textPresetClip,
  textPresetOf
} from '@shared/text/textPresets'
import { textOverlayOf } from '@shared/text/textClip'
import {
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  moveTextItem,
  nudgeTextItem,
  scaleTextItem,
  withBackdrop,
  withColor
} from '@shared/text/textEdits'
import { addTextClip, updateClipTextItem } from '@shared/timeline/edits'
import { CANVAS_HEIGHT, CANVAS_WIDTH, describeFrame } from '@shared/compositor/frame'
import { describeText } from '@shared/text/textRender'
import { selectionHeaderFor, selectionTypeFor } from '@renderer/features/inspector/inspectorModel'

const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }

function textClip(id: string, item: TextItem, startMs = 0, durationMs = 2000): Clip {
  return {
    id,
    startMs,
    durationMs,
    sourceInMs: 0,
    transform: IDENTITY_TRANSFORM,
    textItem: item
  }
}

function timelineWithText(item: TextItem): Timeline {
  return {
    tracks: [
      { id: 'text-1', kind: 'text', role: 'text', muted: false, clips: [textClip('t1', item)] }
    ]
  }
}

describe('text presets', () => {
  it('has the three templates, each with a valid item and a valid clip', () => {
    expect(TEXT_PRESETS.map((preset) => preset.id)).toEqual([
      'title-card',
      'lower-third',
      'call-to-action'
    ])
    for (const preset of TEXT_PRESETS) {
      expect(textItemSchema.parse(presetItem(preset))).toEqual(presetItem(preset))
      const clip = textPresetClip(preset, 'clip-new', 500)
      expect(clipSchema.parse(clip).startMs).toBe(500)
      expect(clip.durationMs).toBe(preset.durationMs)
    }
  })

  it('keeps every preset anchor inside the safe zone', () => {
    for (const preset of TEXT_PRESETS) {
      expect(preset.x).toBeGreaterThanOrEqual(0.05)
      expect(preset.x).toBeLessThanOrEqual(0.95)
      expect(preset.y).toBeGreaterThanOrEqual(0.1)
      expect(preset.y).toBeLessThanOrEqual(0.9)
    }
  })

  it('applies a look while keeping the words and position, and clearing colour and backdrop', () => {
    const preset = textPresetOf('title-card')
    const edited: TextItem = {
      text: 'My words',
      styleId: 'caption',
      x: 0.2,
      y: 0.7,
      scale: 2,
      color: 'sage',
      backdrop: 'void'
    }
    expect(applyTextPresetLook(edited, preset)).toEqual({
      text: 'My words',
      styleId: 'display',
      x: 0.2,
      y: 0.7,
      scale: 1,
      enter: 'fade',
      exit: 'fade'
    })
  })

  it('matches an item to the preset whose look it has, or to none', () => {
    const preset = textPresetOf('lower-third')
    expect(matchTextPreset(presetItem(preset))).toBe('lower-third')
    expect(matchTextPreset({ ...presetItem(preset), scale: 1.5 })).toBeNull()
    expect(matchTextPreset({ ...presetItem(preset), color: 'ivory' })).toBeNull()
  })
})

describe('text item edits', () => {
  it('moves an item by a canvas point and keeps it on the frame', () => {
    const item = moveTextItem(
      { text: 'a', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 },
      CANVAS_WIDTH * 2,
      -50,
      canvas
    )
    expect(item.x).toBe(1)
    expect(item.y).toBe(0)
  })

  it('nudges by canvas pixels', () => {
    const item = nudgeTextItem(
      { text: 'a', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 },
      CANVAS_WIDTH / 10,
      0,
      canvas
    )
    expect(item.x).toBeCloseTo(0.6)
    expect(item.y).toBe(0.5)
  })

  it('scales within the text scale range', () => {
    const item = { text: 'a', styleId: 'caption' as const, x: 0.5, y: 0.5, scale: 1 }
    expect(scaleTextItem(item, 100).scale).toBe(MAX_TEXT_SCALE)
    expect(scaleTextItem(item, 0.01).scale).toBe(MIN_TEXT_SCALE)
  })

  it('sets and clears the colour and backdrop keys', () => {
    const item: TextItem = { text: 'a', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 }
    const coloured = withColor(withBackdrop(item, 'void'), 'ivory')
    expect(coloured.color).toBe('ivory')
    expect(coloured.backdrop).toBe('void')
    expect(withColor(coloured, undefined)).not.toHaveProperty('color')
    expect(withBackdrop(coloured, undefined)).not.toHaveProperty('backdrop')
    expect(item).not.toHaveProperty('color')
  })

  it('updates the stored item of a text clip as one timeline edit', () => {
    const timeline = timelineWithText({ text: 'Hi', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 })
    const next = updateClipTextItem(timeline, 't1', (item) => ({ ...item, text: 'Hello' }))
    expect(next.tracks[0].clips[0].textItem?.text).toBe('Hello')
    expect(timeline.tracks[0].clips[0].textItem?.text).toBe('Hi')
  })

  it('refuses a text edit on a clip with no text item, and on a locked track', () => {
    const plain: Timeline = {
      tracks: [
        {
          id: 'video',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [{ ...textClip('v1', presetItem(TEXT_PRESETS[0])), textItem: undefined }]
        }
      ]
    }
    expect(() => updateClipTextItem(plain, 'v1', (item) => item)).toThrow()
    const locked = timelineWithText(presetItem(TEXT_PRESETS[0]))
    locked.tracks[0].locked = true
    expect(() => updateClipTextItem(locked, 't1', (item) => item)).toThrow()
  })

  it('adds a preset clip to a new text track when the short has none', () => {
    const timeline: Timeline = { tracks: [] }
    const clip = textPresetClip(textPresetOf('call-to-action'), 'cta', 1000)
    const next = addTextClip(timeline, clip, 'text-new')
    expect(next.tracks).toHaveLength(1)
    expect(next.tracks[0]).toMatchObject({ id: 'text-new', kind: 'text', role: 'text' })
    expect(next.tracks[0].clips[0]).toMatchObject({ id: 'cta', startMs: 1000 })
  })

  it('adds a preset clip to the existing text track, overlapping others', () => {
    const timeline = timelineWithText(presetItem(TEXT_PRESETS[0]))
    const clip = textPresetClip(textPresetOf('lower-third'), 'low', 0)
    const next = addTextClip(timeline, clip, 'unused')
    expect(next.tracks).toHaveLength(1)
    expect(next.tracks[0].clips.map((item) => item.id)).toEqual(['t1', 'low'])
  })

  it('finds a text overlay only on a text track, not on a captions track', () => {
    const timeline = timelineWithText(presetItem(TEXT_PRESETS[0]))
    expect(textOverlayOf(timeline, 't1')?.clip.id).toBe('t1')
    const captions: Timeline = {
      tracks: [
        {
          id: 'cap',
          kind: 'text',
          role: 'captions',
          muted: false,
          clips: [textClip('c1', presetItem(TEXT_PRESETS[0]))]
        }
      ]
    }
    expect(textOverlayOf(captions, 'c1')).toBeNull()
  })

  it('selects a text clip as the text-clip selection, with its own header', () => {
    const timeline = timelineWithText(presetItem(TEXT_PRESETS[0]))
    expect(selectionTypeFor(timeline, ['t1'], null)).toBe('text-clip')
    expect(selectionHeaderFor('text-clip', 1)).toBe('Text clip')
    expect(selectionHeaderFor('text-clip', 3)).toBe('3 text clips')
  })
})

describe('text overlay render', () => {
  it('uses a colour override and draws a backdrop with padding around the text', () => {
    const plain = describeText(
      { text: 'Hi', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 },
      0,
      2000,
      canvas
    )
    const boxed = describeText(
      { text: 'Hi', styleId: 'caption', x: 0.5, y: 0.5, scale: 1, color: 'sage', backdrop: 'void' },
      0,
      2000,
      canvas
    )
    expect(plain?.backdrop).toBeNull()
    expect(boxed?.fill).toBe('#c4dca5')
    expect(boxed?.backdrop).toEqual({ color: '#050606' })
    expect(boxed!.padPx).toBeGreaterThan(0)
    expect(boxed!.boxWidthPx).toBeGreaterThan(plain!.boxWidthPx)
    expect(boxed!.boxHeightPx).toBeGreaterThan(boxed!.lineHeightPx)
  })

  it('places a text layer at its anchor, sized to its text box', () => {
    const item = { text: 'Hook', styleId: 'display' as const, x: 0.25, y: 0.6, scale: 1 }
    const timeline = timelineWithText(item)
    const layer = describeFrame(timeline, 500).layers[0]
    expect(layer.placement.centerX).toBeCloseTo(CANVAS_WIDTH * 0.25)
    expect(layer.placement.centerY).toBeCloseTo(CANVAS_HEIGHT * 0.6)
    expect(layer.placement.width).toBeGreaterThan(0)
    expect(layer.placement.height).toBeGreaterThan(0)
  })

  it('gives a blank text overlay a zero-size box, so nothing can select it by accident', () => {
    const timeline = timelineWithText({ text: '  ', styleId: 'caption', x: 0.5, y: 0.5, scale: 1 })
    const layer = describeFrame(timeline, 500).layers[0]
    expect(layer.placement.width).toBe(0)
    expect(layer.placement.height).toBe(0)
  })
})
