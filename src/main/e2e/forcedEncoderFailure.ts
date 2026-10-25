// E2E-only switch for the export fallback. With AISS_E2E=1 and AISS_E2E_FAIL_HW_ENCODER=1 the encoder
// is reported as a hardware one (h264_nvenc) and every encode that uses a hardware encoder fails, so the
// x264 fallback in exportJob.ts runs on any machine. With either flag unset nothing changes.
import { HARDWARE_ENCODERS, type EncoderInfo } from '@shared/export/exportSettings'
import { isE2eMode } from './e2eMode'

export const FAIL_HW_ENCODER_ENV = 'AISS_E2E_FAIL_HW_ENCODER'

export function hardwareEncoderFailureForced(env: NodeJS.ProcessEnv = process.env): boolean {
  return isE2eMode(env) && env[FAIL_HW_ENCODER_ENV] === '1'
}

/** The encoder detection result, with a forced hardware encoder when the switch is on. */
export function withForcedHardwareEncoder(
  detected: EncoderInfo,
  env: NodeJS.ProcessEnv = process.env
): EncoderInfo {
  if (!hardwareEncoderFailureForced(env)) return detected
  return { ...detected, encoder: HARDWARE_ENCODERS[0], hardware: true, fallback: false }
}

/** True when an FFmpeg argument list encodes with a hardware encoder while the switch is on. */
export function encodeFailsByForce(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!hardwareEncoderFailureForced(env)) return false
  return args.some((arg) => (HARDWARE_ENCODERS as readonly string[]).includes(arg))
}
