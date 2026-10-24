import { describe, expect, it } from 'vitest'
import { filmstripPlan } from '../src/shared/media/thumbs'
import type { Clip } from '../src/shared/timeline/timeline'
import {
  clipBox,
  clipLabel,
  clipsInRange,
  filmstripTiles,
  sourceStrip,
  visibleLaneRange
} from '../src/renderer/features/timeline/clipView'

const transform = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

function clip(overrides: Partial<Clip> & Pick<Clip, 'id' | 'startMs' | 'durationMs'>): Clip {
  return { sourceInMs: 0, transform, ...overrides }
}

describe('clipBox', () => {
  it('places a clip by its start and length at the current scale', () => {
    expect(clipBox(clip({ id: 'a', startMs: 2000, durationMs: 1500 }), 0.1)).toEqual({
      leftPx: 200,
      widthPx: 150
    })
  })
})

describe('visibleLaneRange and clipsInRange', () => {
  it('keeps only clips that overlap the viewport plus overscan', () => {
    // Header 150px, view 400px scrolled to 0: the body shows lane x 0..250 before overscan.
    const range = visibleLaneRange(0, 400, 150, 0)
    expect(range).toEqual({ fromPx: 0, toPx: 250 })

    const clips = [
      clip({ id: 'early', startMs: 0, durationMs: 1000 }),
      clip({ id: 'mid', startMs: 2000, durationMs: 1000 }),
      clip({ id: 'far', startMs: 50_000, durationMs: 1000 })
    ]
    expect(clipsInRange(clips, 0.1, range).map((item) => item.id)).toEqual(['early', 'mid'])
  })

  it('keeps a clip that starts before the range and runs into it', () => {
    const clips = [clip({ id: 'long', startMs: 0, durationMs: 10_000 })]
    expect(clipsInRange(clips, 0.1, { fromPx: 500, toPx: 600 }).map((c) => c.id)).toEqual(['long'])
  })
})

describe('clipLabel', () => {
  it('prefers the moment name, then text, then the media file name', () => {
    const base = clip({ id: 'a', startMs: 0, durationMs: 1000, mediaId: 'm1' })
    expect(clipLabel({ ...base, label: 'Hook' }, 'take1.mp4')).toBe('Hook')
    expect(clipLabel({ ...base, text: 'Subscribe' }, 'take1.mp4')).toBe('Subscribe')
    expect(clipLabel(base, 'take1.mp4')).toBe('take1.mp4')
    expect(clipLabel(base)).toBe('Clip')
  })
})

describe('filmstripTiles', () => {
  // A 60 second video gives one frame a second, in a 10 column sprite.
  const plan = filmstripPlan(60)

  it('places one tile per frame across the visible part of the clip only', () => {
    const tiles = filmstripTiles({
      sourceInMs: 3000,
      plan,
      pxPerMs: 0.1,
      tileWidthPx: 100,
      widthPx: 5000,
      fromPx: 200,
      toPx: 450
    })
    // Tiles at 200, 300 and 400 px. Source time 3000 + leftPx / 0.1 gives frames 5, 6 and 7.
    expect(tiles).toEqual([
      { leftPx: 200, col: 5, row: 0 },
      { leftPx: 300, col: 6, row: 0 },
      { leftPx: 400, col: 7, row: 0 }
    ])
  })

  it('wraps frames into rows and never reads past the last frame', () => {
    const tiles = filmstripTiles({
      sourceInMs: 55_000,
      plan,
      pxPerMs: 0.01,
      tileWidthPx: 100,
      widthPx: 2000,
      fromPx: 0,
      toPx: 2000
    })
    const last = tiles[tiles.length - 1]
    expect(last).toEqual({ leftPx: 1900, col: 9, row: 5 })
    expect(tiles.every((tile) => tile.row < plan.rows)).toBe(true)
  })

  it('returns nothing for a zero-size tile', () => {
    expect(
      filmstripTiles({
        sourceInMs: 0,
        plan,
        pxPerMs: 0.1,
        tileWidthPx: 0,
        widthPx: 500,
        fromPx: 0,
        toPx: 500
      })
    ).toEqual([])
  })
})

describe('sourceStrip', () => {
  it('scales the whole-file image so the clip shows its own source span', () => {
    // A 10 s clip from 5 s into a 20 s file, at 0.1 px per ms: 1000 px wide, 2000 px for the file.
    const strip = sourceStrip(
      clip({ id: 'a', startMs: 0, durationMs: 10_000, sourceInMs: 5000 }),
      20_000,
      0.1
    )
    expect(strip).toEqual({ imageWidthPx: 2000, offsetPx: -500 })
  })

  it('is null when the media length is unknown', () => {
    expect(sourceStrip(clip({ id: 'a', startMs: 0, durationMs: 1000 }), undefined, 0.1)).toBeNull()
  })
})
