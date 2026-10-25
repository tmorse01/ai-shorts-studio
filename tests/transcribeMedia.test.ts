import { describe, expect, it } from 'vitest'
import type { Transcript } from '@shared/analysis/transcript'
import { transcribeMediaItems, type TranscribeQueue } from '../src/main/captions/transcribeMedia'

const transcript: Transcript = {
  version: 1,
  words: [{ text: 'hi', startMs: 0, endMs: 200 }],
  segments: [{ text: 'hi', startMs: 0, endMs: 200 }]
}

// A store whose transcript appears once a job has run for that media id. `failing` ids reject.
function fakeStore(initial: string[], failing: string[] = []) {
  const ready = new Set(initial)
  const jobs: string[] = []
  const queue: TranscribeQueue = {
    enqueue: (_kind, path) => {
      jobs.push(path)
      const id = path.replace('/media/', '').replace('.mp4', '')
      const done = failing.includes(id)
        ? Promise.reject(new Error('model failed'))
        : Promise.resolve().then(() => {
            ready.add(id)
          })
      return { done }
    }
  }
  const read = async (_folder: string, mediaId: string) => ({
    transcript: ready.has(mediaId) ? transcript : null
  })
  return { queue, read, jobs }
}

describe('transcribeMediaItems', () => {
  it('reuses a cached transcript and runs no job for it', async () => {
    const store = fakeStore(['a'])
    const results = await transcribeMediaItems(
      '/proj',
      [{ id: 'a', path: '/media/a.mp4' }],
      store.queue,
      store.read
    )
    expect(results).toEqual([{ mediaId: 'a', transcript }])
    expect(store.jobs).toEqual([])
  })

  it('transcribes a missing one as a job, then returns it', async () => {
    const store = fakeStore([])
    const results = await transcribeMediaItems(
      '/proj',
      [{ id: 'b', path: '/media/b.mp4' }],
      store.queue,
      store.read
    )
    expect(results).toEqual([{ mediaId: 'b', transcript }])
    expect(store.jobs).toEqual(['/media/b.mp4'])
  })

  it('returns null for an item whose transcription fails and keeps going', async () => {
    const store = fakeStore([], ['bad'])
    const results = await transcribeMediaItems(
      '/proj',
      [
        { id: 'bad', path: '/media/bad.mp4' },
        { id: 'ok', path: '/media/ok.mp4' }
      ],
      store.queue,
      store.read
    )
    expect(results).toEqual([
      { mediaId: 'bad', transcript: null },
      { mediaId: 'ok', transcript }
    ])
  })
})
