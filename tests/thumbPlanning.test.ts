import { describe, expect, it } from 'vitest'
import { filmstripPlan, thumbFileName } from '@shared/media/thumbs'
import { filmstripArgs, posterArgs } from '../src/main/media/thumbnails'

describe('filmstripPlan', () => {
  it('takes one frame a second for short footage, laid out in rows of ten', () => {
    expect(filmstripPlan(30)).toEqual({ frames: 30, intervalSec: 1, columns: 10, rows: 3 })
  })

  it('caps the frame count and spaces the frames evenly for long footage', () => {
    expect(filmstripPlan(120)).toEqual({ frames: 60, intervalSec: 2, columns: 10, rows: 6 })
  })

  it('always plans at least one frame', () => {
    expect(filmstripPlan(0.4)).toEqual({ frames: 1, intervalSec: 1, columns: 1, rows: 1 })
  })
})

describe('thumbFileName', () => {
  it('names the poster, image thumbnail and waveform files by kind', () => {
    expect(thumbFileName('video')).toBe('poster.jpg')
    expect(thumbFileName('image')).toBe('thumb.jpg')
    expect(thumbFileName('audio')).toBe('waveform.png')
  })
})

describe('ffmpeg arguments', () => {
  it('builds a poster frame from the first frame, writing the output last', () => {
    const args = posterArgs('clip.mp4', 'poster.jpg')
    expect(args).toContain('-frames:v')
    expect(args.at(-1)).toBe('poster.jpg')
  })

  it('builds the filmstrip from the planned interval and tile grid', () => {
    const args = filmstripArgs('clip.mp4', 'filmstrip.jpg', filmstripPlan(120))
    expect(args[args.indexOf('-vf') + 1]).toBe('fps=1/2,scale=160:-2,tile=10x6')
    expect(args.at(-1)).toBe('filmstrip.jpg')
  })
})
