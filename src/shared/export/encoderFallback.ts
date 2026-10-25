// What an export does when its encoder fails while encoding (Epic 17, #150). A hardware encoder can be built
// into FFmpeg and still fail on the machine (no GPU, a driver too old, the session limit reached). Then the
// same job is retried once with x264, which every build has. Pure: it reads the failure and returns the
// next encoder, and runs nothing.
import { HARDWARE_ENCODERS, SOFTWARE_ENCODER } from './exportSettings'

export interface EncodeFailure {
  // True when the user cancelled the job. A cancel is never retried.
  cancelled: boolean
  // What FFmpeg printed on the failure, when known. Recorded for the queue's details view.
  details?: string
}

// The encoder to retry with after a failed encode, or null when the job should fail. A hardware encoder that
// fails is retried with libx264. x264 failing is final, and so is any other encoder name.
export function fallbackEncoder(encoder: string, failure: EncodeFailure): string | null {
  if (failure.cancelled) return null
  if (encoder === SOFTWARE_ENCODER) return null
  return (HARDWARE_ENCODERS as readonly string[]).includes(encoder) ? SOFTWARE_ENCODER : null
}
