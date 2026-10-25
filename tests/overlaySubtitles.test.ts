import { describe, expect, it } from 'vitest'
import { assTime, buildOverlaySubtitles, parseFontCss } from '@shared/render/overlaySubtitles'
import type { Clip, Timeline } from '@shared/timeline/timeline'
import type { TextItem } from '@shared/text/textItem'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function textClip(id: string, text: string, extra: Partial<TextItem> = {}): Clip {
  return {
    id,
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 0,
    transform: IDENTITY,
    textItem: { text, styleId: 'display', x: 0.5, y: 0.25, scale: 1, ...extra } as TextItem
  }
}

function textTimeline(clips: Clip[]): Timeline {
  return { tracks: [{ id: 'text', kind: 'text', role: 'text', muted: false, clips }] }
}

function events(script: string | null): string[] {
  return (script ?? '').split('\n').filter((line) => line.startsWith('Dialogue:'))
}

describe('buildOverlaySubtitles', () => {
  it('returns null when the timeline has no text or captions', () => {
    expect(buildOverlaySubtitles({ tracks: [] }, { fps: 30 })).toBeNull()
  })

  it('writes a canvas-sized script with one event for a static text overlay', () => {
    const script = buildOverlaySubtitles(textTimeline([textClip('t1', 'Hello')]), { fps: 30 })
    expect(script).toContain('PlayResX: 1080')
    expect(script).toContain('PlayResY: 1920')
    expect(events(script)).toHaveLength(1)
    expect(events(script)[0]).toContain('0:00:00.00,0:00:02.00,Plain')
    // Centred at half the width and a quarter of the height (1920 * 0.25).
    expect(events(script)[0]).toContain('\\an5\\pos(540,480)')
    expect(events(script)[0]).toContain('Hello')
  })

  it('uses the Box style for a text overlay with a backdrop', () => {
    const script = buildOverlaySubtitles(
      textTimeline([textClip('t1', 'Hello', { backdrop: 'void' })]),
      { fps: 30 }
    )
    expect(events(script)[0]).toContain(',Box,')
  })

  it('escapes braces and backslashes so they cannot start an override tag', () => {
    const script = buildOverlaySubtitles(textTimeline([textClip('t1', 'a{b}c\\d')]), { fps: 30 })
    expect(events(script)[0]).toContain('a(b)c/d')
  })

  it('merges frames that read the same into one event per caption state', () => {
    // A short always has footage, which sets its length. The captions sit on top of it.
    const footage: Clip = {
      id: 'v1',
      mediaId: 'cam',
      startMs: 0,
      durationMs: 2000,
      sourceInMs: 0,
      transform: IDENTITY
    }
    const timeline: Timeline = {
      tracks: [
        { id: 'main', kind: 'video', role: 'main', muted: false, clips: [footage] },
        {
          id: 'captions',
          kind: 'text',
          role: 'captions',
          muted: false,
          clips: [],
          captions: [
            {
              id: 'b1',
              words: [
                { text: 'Hello', startMs: 0, endMs: 500 },
                { text: 'there', startMs: 500, endMs: 1000 }
              ]
            }
          ]
        }
      ]
    }
    const lines = events(buildOverlaySubtitles(timeline, { fps: 30 }))
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('\n')).toMatch(/hello/i)
    // The spoken word changes, so the block splits into runs, but far fewer than one per frame.
    expect(lines.length).toBeLessThan(30)
  })
})

describe('assTime', () => {
  it('formats hours, minutes, seconds and centiseconds', () => {
    expect(assTime(0)).toBe('0:00:00.00')
    expect(assTime(3723456)).toBe('1:02:03.46')
  })
})

describe('parseFontCss', () => {
  it('reads the first family name and a bold weight', () => {
    expect(parseFontCss("600 64px 'Inter Variable', system-ui, sans-serif")).toEqual({
      family: 'Inter Variable',
      bold: true
    })
    expect(parseFontCss("400 40px 'Cormorant Garamond', Georgia, serif")).toEqual({
      family: 'Cormorant Garamond',
      bold: false
    })
  })
})
