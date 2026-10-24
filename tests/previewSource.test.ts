import { describe, expect, it } from 'vitest'
import { chooseVariant, mediaUrl, parseMediaUrl } from '@shared/media/previewSource'

describe('preview media URLs', () => {
  it('round-trips a media id and variant through the aism-media scheme', () => {
    const url = mediaUrl('clip-01_A', 'proxy')
    expect(url).toBe('aism-media://media/clip-01_A/proxy')
    expect(parseMediaUrl(url)).toEqual({ mediaId: 'clip-01_A', variant: 'proxy' })
  })

  it('rejects URLs that are not ours, paths, bad ids and unknown variants', () => {
    expect(parseMediaUrl('file:///C:/videos/clip.mp4')).toBeNull()
    expect(parseMediaUrl('aism-media://other/abc/original')).toBeNull()
    expect(parseMediaUrl('aism-media://media/../../secret/original')).toBeNull()
    expect(parseMediaUrl('aism-media://media/abc/raw')).toBeNull()
    expect(parseMediaUrl('not a url')).toBeNull()
  })
})

describe('chooseVariant', () => {
  it('plays the proxy while playing when one is ready', () => {
    expect(chooseVariant({ useOriginals: false, playing: true, proxyReady: true })).toBe('proxy')
  })

  it('uses the original while paused, when originals are chosen, or when no proxy exists yet', () => {
    expect(chooseVariant({ useOriginals: false, playing: false, proxyReady: true })).toBe(
      'original'
    )
    expect(chooseVariant({ useOriginals: true, playing: true, proxyReady: true })).toBe('original')
    expect(chooseVariant({ useOriginals: false, playing: true, proxyReady: false })).toBe(
      'original'
    )
  })
})
