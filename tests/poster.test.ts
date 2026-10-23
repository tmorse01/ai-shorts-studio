import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(process.cwd()) }
}))

const { buildPosterArgs, posterFile, posterTimeSec, POSTER_WIDTH, CLIP_FRAME_SIZES } = await import('../src/main/poster')

describe('poster frames', () => {
  it('takes the frame one second in, or the midpoint of very short clips', () => {
    expect(posterTimeSec(60)).toBe(1)
    expect(posterTimeSec(1)).toBe(0.5)
  })

  it('seeks before the input and writes one scaled frame', () => {
    const args = buildPosterArgs('C:\\Footage\\a.mp4', 'C:\\cache\\poster.jpg', 1)
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 2)).toEqual(['-ss', '1.000'])
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args).toContain('-frames:v')
    expect(args).toContain(`scale='min(${POSTER_WIDTH},iw)':-2`)
    expect(args.at(-1)).toBe('C:\\cache\\poster.jpg')
  })

  it('renders the preview frame larger and at higher quality than the card', () => {
    const card = buildPosterArgs('in.mp4', 'card.jpg', 1)
    const preview = buildPosterArgs('in.mp4', 'preview.jpg', 1, CLIP_FRAME_SIZES.preview, 2)
    expect(preview).toContain(`scale='min(${CLIP_FRAME_SIZES.preview},iw)':-2`)
    expect(CLIP_FRAME_SIZES.preview).toBeGreaterThan(CLIP_FRAME_SIZES.card)
    expect(preview[preview.indexOf('-q:v') + 1]).toBe('2')
    expect(card[card.indexOf('-q:v') + 1]).toBe('5')
  })

  it('keeps each asset poster in its own cache folder', () => {
    expect(posterFile('/data', 'proj-1', 'asset-9')).toBe(join('/data', 'cache', 'proj-1', 'asset-9', 'poster.jpg'))
  })
})
