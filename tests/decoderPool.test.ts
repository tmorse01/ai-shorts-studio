import { describe, expect, it } from 'vitest'
import { DecoderPool, type PoolVideo } from '../src/renderer/features/preview/decoderPool'

function fakeVideo(): PoolVideo {
  return {
    src: '',
    currentTime: 0,
    readyState: 0,
    paused: true,
    play: () => undefined,
    pause: () => undefined
  }
}

describe('DecoderPool', () => {
  it('reuses the element that already holds a source', () => {
    const pool = new DecoderPool(fakeVideo, 3)
    const first = pool.acquire('aism-media://media/a/original')
    expect(pool.acquire('aism-media://media/a/original')).toBe(first)
    expect(pool.sourceOf(first)).toBe('aism-media://media/a/original')
  })

  it('gives the least recently used element to a new source once the pool is full', () => {
    const pool = new DecoderPool(fakeVideo, 2)
    const a = pool.acquire('a')
    const b = pool.acquire('b')
    pool.acquire('a') // a is now the most recently used
    const c = pool.acquire('c')
    expect(c).toBe(b)
    expect(pool.sourceOf(b)).toBe('c')
    expect(pool.acquire('a')).toBe(a)
  })

  it('loads the new source into the element it reuses', () => {
    const pool = new DecoderPool(fakeVideo, 1)
    const video = pool.acquire('x')
    expect(video.src).toBe('x')
    expect(pool.acquire('y')).toBe(video)
    expect(video.src).toBe('y')
  })

  it('rejects a pool with no elements', () => {
    expect(() => new DecoderPool(fakeVideo, 0)).toThrow(RangeError)
  })
})
