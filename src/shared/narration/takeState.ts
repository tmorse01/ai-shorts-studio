// The recording state machine for one voiceover take (Epic 10, #108). A pure reducer: the controller
// sends events (start, tick, stop, saved, failed) and reads back the state. Invalid events for a state
// are ignored, so a double click cannot start two takes.

export type TakeState =
  | { status: 'idle' }
  // Counting in before the take. The playhead does not move yet.
  | { status: 'countIn'; remainingMs: number; startPlayheadMs: number }
  // The take is being recorded, and the timeline plays from startPlayheadMs.
  | { status: 'recording'; startPlayheadMs: number; elapsedMs: number }
  // The recorder stopped and the take is being encoded and saved.
  | { status: 'saving'; startPlayheadMs: number }
  | { status: 'error'; message: string }

export type TakeEvent =
  | { type: 'start'; countInMs: number; playheadMs: number }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'stop' }
  | { type: 'saved' }
  | { type: 'failed'; message: string }
  | { type: 'dismiss' }

export const IDLE_TAKE: TakeState = { status: 'idle' }

export function takeReducer(state: TakeState, event: TakeEvent): TakeState {
  switch (event.type) {
    case 'start':
      if (state.status !== 'idle' && state.status !== 'error') return state
      if (event.countInMs > 0) {
        return {
          status: 'countIn',
          remainingMs: event.countInMs,
          startPlayheadMs: Math.max(0, event.playheadMs)
        }
      }
      return { status: 'recording', startPlayheadMs: Math.max(0, event.playheadMs), elapsedMs: 0 }

    case 'tick':
      if (state.status === 'countIn') {
        const remainingMs = state.remainingMs - Math.max(0, event.elapsedMs)
        if (remainingMs > 0) return { ...state, remainingMs }
        return { status: 'recording', startPlayheadMs: state.startPlayheadMs, elapsedMs: 0 }
      }
      if (state.status === 'recording') {
        return { ...state, elapsedMs: state.elapsedMs + Math.max(0, event.elapsedMs) }
      }
      return state

    case 'stop':
      // Stopping during the count-in only cancels it. Nothing was recorded.
      if (state.status === 'countIn') return IDLE_TAKE
      if (state.status === 'recording') {
        return { status: 'saving', startPlayheadMs: state.startPlayheadMs }
      }
      return state

    case 'saved':
      return state.status === 'saving' ? IDLE_TAKE : state

    case 'failed':
      return state.status === 'error' ? state : { status: 'error', message: event.message }

    case 'dismiss':
      return state.status === 'error' ? IDLE_TAKE : state
  }
}
