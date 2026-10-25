import { describe, expect, it } from 'vitest'
import { IDLE_TAKE, takeReducer, type TakeState } from '@shared/narration/takeState'

function run(state: TakeState, events: Parameters<typeof takeReducer>[1][]): TakeState {
  return events.reduce((current, event) => takeReducer(current, event), state)
}

describe('take recording state machine', () => {
  it('starts recording at once when there is no count-in', () => {
    const state = takeReducer(IDLE_TAKE, { type: 'start', countInMs: 0, playheadMs: 1200 })
    expect(state).toEqual({ status: 'recording', startPlayheadMs: 1200, elapsedMs: 0 })
  })

  it('counts in first, then records from the same playhead', () => {
    let state = takeReducer(IDLE_TAKE, { type: 'start', countInMs: 2000, playheadMs: 500 })
    expect(state).toEqual({ status: 'countIn', remainingMs: 2000, startPlayheadMs: 500 })

    state = takeReducer(state, { type: 'tick', elapsedMs: 1500 })
    expect(state).toEqual({ status: 'countIn', remainingMs: 500, startPlayheadMs: 500 })

    state = takeReducer(state, { type: 'tick', elapsedMs: 600 })
    expect(state).toEqual({ status: 'recording', startPlayheadMs: 500, elapsedMs: 0 })
  })

  it('counts elapsed time while recording and saves on stop', () => {
    const state = run(IDLE_TAKE, [
      { type: 'start', countInMs: 0, playheadMs: 0 },
      { type: 'tick', elapsedMs: 400 },
      { type: 'tick', elapsedMs: 350 },
      { type: 'stop' }
    ])
    expect(state).toEqual({ status: 'saving', startPlayheadMs: 0 })
  })

  it('returns to idle once the take is saved', () => {
    const state = run(IDLE_TAKE, [
      { type: 'start', countInMs: 0, playheadMs: 0 },
      { type: 'stop' },
      { type: 'saved' }
    ])
    expect(state).toEqual(IDLE_TAKE)
  })

  it('cancels during the count-in without recording anything', () => {
    const state = run(IDLE_TAKE, [
      { type: 'start', countInMs: 4000, playheadMs: 0 },
      { type: 'stop' }
    ])
    expect(state).toEqual(IDLE_TAKE)
  })

  it('ignores a second start while a take is active', () => {
    const recording: TakeState = { status: 'recording', startPlayheadMs: 100, elapsedMs: 0 }
    expect(takeReducer(recording, { type: 'start', countInMs: 0, playheadMs: 900 })).toBe(recording)
  })

  it('ignores ticks and stops when no take is active', () => {
    expect(takeReducer(IDLE_TAKE, { type: 'tick', elapsedMs: 100 })).toBe(IDLE_TAKE)
    expect(takeReducer(IDLE_TAKE, { type: 'stop' })).toBe(IDLE_TAKE)
    expect(takeReducer(IDLE_TAKE, { type: 'saved' })).toBe(IDLE_TAKE)
  })

  it('moves to an error on failure and clears it on dismiss', () => {
    const failed = takeReducer(IDLE_TAKE, { type: 'failed', message: 'No microphone was found.' })
    expect(failed).toEqual({ status: 'error', message: 'No microphone was found.' })
    expect(takeReducer(failed, { type: 'dismiss' })).toEqual(IDLE_TAKE)
  })

  it('can start again after an error', () => {
    const failed: TakeState = { status: 'error', message: 'Blocked' }
    expect(takeReducer(failed, { type: 'start', countInMs: 0, playheadMs: 0 })).toEqual({
      status: 'recording',
      startPlayheadMs: 0,
      elapsedMs: 0
    })
  })

  it('reports a save failure as an error', () => {
    const state = run(IDLE_TAKE, [
      { type: 'start', countInMs: 0, playheadMs: 0 },
      { type: 'stop' },
      { type: 'failed', message: 'Disk full' }
    ])
    expect(state).toEqual({ status: 'error', message: 'Disk full' })
  })
})
