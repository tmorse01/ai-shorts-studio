import { describe, expect, it } from 'vitest'
import {
  defaultTabFor,
  sectionsFor,
  selectionTypeFor,
  type InspectorSectionDef
} from '@renderer/features/inspector/inspectorModel'
import type { Timeline } from '@shared/timeline/timeline'

const Noop = () => null

function section(
  id: string,
  tab: InspectorSectionDef['tab'],
  order: number,
  selections: InspectorSectionDef['selections']
): InspectorSectionDef {
  return { id, title: id, tab, order, selections, Component: Noop }
}

const timeline: Timeline = {
  tracks: [
    {
      id: 'v1',
      kind: 'video',
      role: 'main',
      muted: false,
      clips: [
        {
          id: 'c-video',
          startMs: 0,
          durationMs: 1000,
          sourceInMs: 0,
          transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }
        }
      ]
    },
    {
      id: 'a1',
      kind: 'audio',
      role: 'narration',
      muted: false,
      clips: [
        {
          id: 'c-audio',
          startMs: 0,
          durationMs: 1000,
          sourceInMs: 0,
          transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }
        }
      ]
    }
  ]
}

describe('defaultTabFor', () => {
  it('opens Audio for audio clips and Video for everything else', () => {
    expect(defaultTabFor('audio-clip')).toBe('audio')
    expect(defaultTabFor('video-clip')).toBe('video')
    expect(defaultTabFor('transition')).toBe('video')
    expect(defaultTabFor('gap')).toBe('video')
    expect(defaultTabFor('short')).toBe('video')
  })
})

describe('sectionsFor', () => {
  const sections = [
    section('late', 'video', 20, ['video-clip']),
    section('early', 'video', 10, ['video-clip', 'short']),
    section('audio', 'audio', 5, ['audio-clip']),
    section('ai', 'ai', 1, ['video-clip'])
  ]

  it('keeps sections for the selection type and tab, in order', () => {
    expect(sectionsFor(sections, 'video-clip', 'video').map((s) => s.id)).toEqual(['early', 'late'])
  })

  it('returns nothing when no section matches the selection or tab', () => {
    expect(sectionsFor(sections, 'gap', 'video')).toEqual([])
    expect(sectionsFor(sections, 'audio-clip', 'video')).toEqual([])
    expect(sectionsFor(sections, 'short', 'ai')).toEqual([])
  })
})

describe('selectionTypeFor', () => {
  it('is the short when nothing is selected', () => {
    expect(selectionTypeFor(timeline, [], null)).toBe('short')
  })

  it('is a gap when a gap is selected', () => {
    const gap = { trackId: 'v1', startMs: 1000, endMs: 2000 } as unknown as Parameters<
      typeof selectionTypeFor
    >[2]
    expect(selectionTypeFor(timeline, [], gap)).toBe('gap')
  })

  it('follows the track kind of the first selected clip', () => {
    expect(selectionTypeFor(timeline, ['c-video'], null)).toBe('video-clip')
    expect(selectionTypeFor(timeline, ['c-audio'], null)).toBe('audio-clip')
    expect(selectionTypeFor(timeline, ['c-audio', 'c-video'], null)).toBe('audio-clip')
  })

  it('falls back to the short for a clip id it cannot find', () => {
    expect(selectionTypeFor(timeline, ['missing'], null)).toBe('short')
  })

  it('is a transition when a transition on the timeline is selected', () => {
    const withTransition: Timeline = {
      ...timeline,
      transitions: [{ id: 't1', fromClipId: 'c-video', toClipId: 'c-audio', durationMs: 300 }]
    }
    expect(selectionTypeFor(withTransition, [], null, 't1')).toBe('transition')
    expect(selectionTypeFor(withTransition, [], null, 'missing')).toBe('short')
    expect(selectionTypeFor(withTransition, [], null, null)).toBe('short')
  })
})
