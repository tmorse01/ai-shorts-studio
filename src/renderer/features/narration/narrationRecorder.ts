// Controller for recording a voiceover take (Epic 10, #108). It owns one microphone session, moves the
// timeline with the playback store from #76, and hands the finished take to a commit function. The take
// rules and the state machine are pure (shared/narration); this file only wires them to the mic and the
// transport. Tests pass a fake driver, a fake playback and a fake commit.
import { createStore } from 'zustand'
import { encodeWav, frameCount } from '@shared/narration/wav'
import {
  micErrorMessage,
  takeDurationMs,
  takeStartMs,
  type CountInMs
} from '@shared/narration/take'
import { IDLE_TAKE, takeReducer, type TakeEvent, type TakeState } from '@shared/narration/takeState'
import type { MicDevice, MicDriver, MicSession } from './micDriver'

export interface TakeCommit {
  bytes: Uint8Array<ArrayBuffer>
  // Timeline ms where the clip starts: the playhead when recording began.
  startMs: number
  durationMs: number
}

// The part of the playback store the recorder uses.
export interface RecorderPlayback {
  getState: () => { playheadMs: number; durationMs: number; playing: boolean }
  seek: (ms: number) => void
  play: () => void
  pause: () => void
}

export interface NarrationRecorderDeps {
  driver: MicDriver
  playback: RecorderPlayback
  // Saves the take and adds the narration clip. Rejects with a user-facing message on failure.
  commit: (take: TakeCommit) => Promise<void>
}

export interface NarrationRecorderState {
  take: TakeState
  mics: MicDevice[]
  micId: string | null
  countInMs: CountInMs
  // Live input level, 0 to 1, while a mic is open.
  level: number
}

export interface NarrationRecorder {
  store: ReturnType<typeof createNarrationStore>
  refreshMics: () => Promise<void>
  selectMic: (id: string) => void
  setCountIn: (ms: CountInMs) => void
  start: () => Promise<void>
  stop: () => Promise<void>
  // Moves the count-in or the take's elapsed time. Called on a timer while the take is active.
  tick: (elapsedMs: number) => void
  // Reads the input level from the open mic.
  sampleLevel: () => void
  // The timeline's play state changed. Reaching the end or pausing the transport ends the take.
  transportChanged: (playing: boolean) => void
  dismiss: () => void
  // Releases the mic and drops an unfinished take, for when the editor closes.
  dispose: () => void
}

function createNarrationStore() {
  return createStore<NarrationRecorderState>()(() => ({
    take: IDLE_TAKE,
    mics: [],
    micId: null,
    countInMs: 0,
    level: 0
  }))
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The take could not be saved.'
}

export function createNarrationRecorder(deps: NarrationRecorderDeps): NarrationRecorder {
  const store = createNarrationStore()
  let session: MicSession | null = null
  let opening = false

  const dispatch = (event: TakeEvent) => {
    store.setState((state) => ({ take: takeReducer(state.take, event) }))
  }

  const closeSession = () => {
    session?.close()
    session = null
    store.setState({ level: 0 })
  }

  // Starts the take: the mic records and the timeline plays from the take's start point.
  const beginRecording = (startPlayheadMs: number) => {
    session?.startRecording()
    deps.playback.seek(startPlayheadMs)
    deps.playback.play()
  }

  const fail = (message: string) => {
    closeSession()
    dispatch({ type: 'failed', message })
  }

  // Ends the take: stops the mic, pauses the timeline, encodes and commits the take.
  const stop = async () => {
    const { take } = store.getState()
    if (take.status === 'countIn') {
      dispatch({ type: 'stop' })
      closeSession()
      return
    }
    if (take.status !== 'recording' || session === null) return
    const startMs = take.startPlayheadMs
    const active = session
    dispatch({ type: 'stop' })
    deps.playback.pause()
    try {
      const blob = await active.stopRecording()
      closeSession()
      const decoded = await deps.driver.decode(blob)
      const samples = frameCount(decoded.channels)
      if (samples === 0) throw new Error('The take was empty. Check the microphone and try again.')
      const durationMs = takeDurationMs(samples, decoded.sampleRate)
      const bytes = encodeWav(decoded.channels, decoded.sampleRate)
      await deps.commit({ bytes, startMs: takeStartMs(startMs), durationMs })
      dispatch({ type: 'saved' })
    } catch (error) {
      fail(errorText(error))
    }
  }

  return {
    store,

    async refreshMics() {
      try {
        const mics = await deps.driver.listMicrophones()
        store.setState((state) => ({
          mics,
          micId: mics.some((mic) => mic.id === state.micId) ? state.micId : (mics[0]?.id ?? null)
        }))
      } catch {
        store.setState({ mics: [], micId: null })
      }
    },

    selectMic(id) {
      store.setState({ micId: id })
    },

    setCountIn(ms) {
      store.setState({ countInMs: ms })
    },

    async start() {
      const { take, micId, countInMs } = store.getState()
      if (opening || (take.status !== 'idle' && take.status !== 'error')) return
      const { playheadMs, durationMs } = deps.playback.getState()
      if (durationMs <= 0 || playheadMs >= durationMs) {
        dispatch({ type: 'failed', message: 'Move the playhead before the end of the timeline.' })
        return
      }
      opening = true
      try {
        session = await deps.driver.open(micId)
      } catch (error) {
        opening = false
        const name = error instanceof Error ? error.name : undefined
        fail(micErrorMessage(name))
        return
      }
      opening = false
      dispatch({ type: 'start', countInMs, playheadMs: takeStartMs(playheadMs) })
      const next = store.getState().take
      if (next.status === 'recording') beginRecording(next.startPlayheadMs)
    },

    stop,

    tick(elapsedMs) {
      const before = store.getState().take
      dispatch({ type: 'tick', elapsedMs })
      const after = store.getState().take
      if (before.status === 'countIn' && after.status === 'recording') {
        beginRecording(after.startPlayheadMs)
      }
    },

    sampleLevel() {
      if (session) store.setState({ level: session.level() })
    },

    transportChanged(playing) {
      if (!playing && store.getState().take.status === 'recording') void stop()
    },

    dismiss() {
      dispatch({ type: 'dismiss' })
    },

    dispose() {
      const { take } = store.getState()
      if (take.status === 'recording') deps.playback.pause()
      closeSession()
      if (take.status === 'countIn' || take.status === 'recording') dispatch({ type: 'stop' })
    }
  }
}
