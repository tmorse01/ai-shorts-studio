import { describe, expect, it } from 'vitest'
import {
  averageBitrateBps,
  needsProxy,
  playbackSource,
  proxyArgs,
  proxyFileName,
  proxyProgressFromLine
} from '@shared/media/proxy'

const h264 = { width: 1920, height: 1080, codec: 'h264' }

describe('needsProxy', () => {
  it('does not proxy 1080p H.264 at a normal bitrate', () => {
    expect(needsProxy(h264, 20_000_000)).toBe(false)
  })

  it('proxies footage whose shorter side is above 1080p', () => {
    expect(needsProxy({ width: 3840, height: 2160, codec: 'h264' }, 20_000_000)).toBe(true)
  })

  it('proxies HEVC and ProRes whatever the resolution', () => {
    expect(needsProxy({ width: 1280, height: 720, codec: 'hevc' }, 5_000_000)).toBe(true)
    expect(needsProxy({ width: 1280, height: 720, codec: 'prores' }, 5_000_000)).toBe(true)
  })

  it('proxies high-bitrate footage', () => {
    expect(needsProxy(h264, 80_000_000)).toBe(true)
  })
})

describe('averageBitrateBps', () => {
  it('divides the size in bits by the duration', () => {
    expect(averageBitrateBps(1_000_000, 8)).toBe(1_000_000)
    expect(averageBitrateBps(1_000_000, 0)).toBe(0)
  })
})

describe('proxy helpers', () => {
  it('names the proxy by media id', () => {
    expect(proxyFileName('m1')).toBe('m1.mp4')
  })

  it('writes an mp4 at 720p, forcing the container so a .partial name still works', () => {
    const args = proxyArgs('clip.mov', 'out.mp4.partial')
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=-2:720')
    expect(args.slice(-3)).toEqual(['-f', 'mp4', 'out.mp4.partial'])
  })

  it('reads the fraction done from a progress line', () => {
    expect(proxyProgressFromLine('out_time_ms=30000000', 60)).toBe(0.5)
    expect(proxyProgressFromLine('frame=12', 60)).toBeUndefined()
    expect(proxyProgressFromLine('out_time_ms=90000000', 60)).toBe(1)
  })
})

describe('playbackSource', () => {
  const original = 'G:/Footage/clip.mov'
  const proxy = 'G:/Project/cache/proxies/m1.mp4'

  it('plays the proxy only when it is chosen and ready', () => {
    expect(playbackSource({ useProxy: true }, original, proxy)).toBe(proxy)
  })

  it('falls back to the original when the proxy is not chosen or not ready', () => {
    expect(playbackSource({ useProxy: false }, original, proxy)).toBe(original)
    expect(playbackSource({ useProxy: true }, original, null)).toBe(original)
  })
})
