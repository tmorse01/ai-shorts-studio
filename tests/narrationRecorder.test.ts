import { describe, expect, it } from 'vitest'
import {
  createNarrationRecorder,
  type TakeCommit
} from '../src/renderer/features/narration/narrationRecorder'
import type {
  DecodedAudio,
  MicDriver,
  MicSession
} from '../src/renderer/features/narration/micDriver'

// A fake microphone and media recorder. Nothing opens a device or records real sound.
function fakeDriver(options: { openError?: Error; samples?: number } = {}) {
  const calls: string[] = []
  const session: MicSession = {
    level: () => 0.25,
    startRecording: () => {
      calls.push('mic:start')
    },
    stopRecording: async () => {
      calls.push('mic:stop')
      return new Blob(['webm'])
    },
    close: () => {
      calls.push('mic:close')
    }
  }
  const decoded: DecodedAudio = {
    channels: [new Float32Array(options.samples ?? 4800)],
    sampleRate: 48000
  }
  const driver: MicDriver = {
    listMicrophones: async () => [{ id: 'mic-1', label: 'USB Mic' }],
    open: async () => {
      calls.push('mic:open')
      if (options.openError) throw options.openError
      return session
    },
    decode: async () => decoded
  }
  return { driver, calls }
}

function fakePlayback(playheadMs = 0, durationMs = 10_000) {
  const state = { playheadMs, durationMs, playing: false }
  const calls: string[] = []
  return {
    state,
    calls,
    playback: {
      getState: () => state,
      seek: (ms: number) => {
        state.playheadMs = ms
        calls.push(`seek:${ms}`)
      },
      play: () => {
        state.playing = true
        calls.push('play')
      },
      pause: () => {
        state.playing = false
        calls.push('pause')
      }
    }
  }
}

function setup(
  options: { playheadMs?: number; openError?: Error; samples?: number; commitError?: Error } = {}
) {
  const mic = fakeDriver(options)
  const timeline = fakePlayback(options.playheadMs ?? 0)
  const commits: TakeCommit[] = []
  const recorder = createNarrationRecorder({
    driver: mic.driver,
    playback: timeline.playback,
    commit: async (take) => {
      if (options.commitError) throw options.commitError
      commits.push(take)
    }
  })
  return { recorder, mic, timeline, commits }
}

describe('narration recorder', () => {
  it('lists microphones and selects the first one by default', async () => {
    const { recorder } = setup()
    await recorder.refreshMics()
    expect(recorder.store.getState().mics).toEqual([{ id: 'mic-1', label: 'USB Mic' }])
    expect(recorder.store.getState().micId).toBe('mic-1')
  })

  it('records from the playhead and plays the timeline from the same point', async () => {
    const { recorder, mic, timeline } = setup({ playheadMs: 2500 })
    await recorder.start()
    expect(recorder.store.getState().take).toEqual({
      status: 'recording',
      startPlayheadMs: 2500,
      elapsedMs: 0
    })
    expect(timeline.calls).toEqual(['seek:2500', 'play'])
    expect(mic.calls).toEqual(['mic:open', 'mic:start'])
  })

  it('waits for the count-in before the mic and the timeline start', async () => {
    const { recorder, mic, timeline } = setup({ playheadMs: 1000 })
    recorder.setCountIn(2000)
    await recorder.start()
    recorder.tick(1500)
    expect(mic.calls).toEqual(['mic:open'])
    expect(timeline.calls).toEqual([])

    recorder.tick(600)
    expect(mic.calls).toEqual(['mic:open', 'mic:start'])
    expect(timeline.calls).toEqual(['seek:1000', 'play'])
  })

  it('commits a take that starts at the playhead, with its measured length', async () => {
    const { recorder, timeline, commits } = setup({ playheadMs: 3000, samples: 24000 })
    await recorder.start()
    recorder.tick(800)
    await recorder.stop()

    expect(timeline.calls).toContain('pause')
    expect(commits).toHaveLength(1)
    expect(commits[0].startMs).toBe(3000)
    expect(commits[0].durationMs).toBe(500)
    expect(commits[0].bytes.byteLength).toBe(44 + 24000 * 2)
    expect(recorder.store.getState().take).toEqual({ status: 'idle' })
    expect(recorder.store.getState().level).toBe(0)
  })

  it('ends the take when the timeline reaches its end or pauses', async () => {
    const { recorder, commits, timeline } = setup()
    await recorder.start()
    recorder.transportChanged(true)
    expect(recorder.store.getState().take.status).toBe('recording')

    recorder.transportChanged(false)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(commits).toHaveLength(1)
    expect(timeline.calls.filter((call) => call === 'pause')).toHaveLength(1)
  })

  it('shows a plain message and records nothing when the mic is blocked', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    const { recorder, commits } = setup({ openError: denied })
    await recorder.start()
    expect(recorder.store.getState().take).toEqual({
      status: 'error',
      message: expect.stringContaining('Microphone access is blocked')
    })
    expect(commits).toHaveLength(0)
  })

  it('refuses to start with the playhead at the end of the timeline', async () => {
    const { recorder, mic } = setup({ playheadMs: 10_000 })
    await recorder.start()
    expect(recorder.store.getState().take).toEqual({
      status: 'error',
      message: 'Move the playhead before the end of the timeline.'
    })
    expect(mic.calls).toEqual([])
  })

  it('reports an empty take instead of saving it', async () => {
    const { recorder, commits } = setup({ samples: 0 })
    await recorder.start()
    await recorder.stop()
    expect(commits).toHaveLength(0)
    expect(recorder.store.getState().take).toEqual({
      status: 'error',
      message: 'The take was empty. Check the microphone and try again.'
    })
  })

  it('keeps the save error from the commit and releases the mic', async () => {
    const { recorder, mic } = setup({ commitError: new Error('Disk full') })
    await recorder.start()
    await recorder.stop()
    expect(recorder.store.getState().take).toEqual({ status: 'error', message: 'Disk full' })
    expect(mic.calls.at(-1)).toBe('mic:close')
  })

  it('cancels a count-in without opening the timeline', async () => {
    const { recorder, timeline } = setup()
    recorder.setCountIn(4000)
    await recorder.start()
    await recorder.stop()
    expect(recorder.store.getState().take).toEqual({ status: 'idle' })
    expect(timeline.calls).toEqual([])
  })
})
