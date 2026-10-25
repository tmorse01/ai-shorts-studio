import { describe, expect, it } from 'vitest'
import {
  encodeFailsByForce,
  hardwareEncoderFailureForced,
  withForcedHardwareEncoder
} from '../src/main/e2e/forcedEncoderFailure'
import type { EncoderInfo } from '@shared/export/exportSettings'

const ON = { AISS_E2E: '1', AISS_E2E_FAIL_HW_ENCODER: '1' }
const software: EncoderInfo = {
  encoder: 'libx264',
  hardware: false,
  fallback: true,
  ffmpegVersion: 'ffmpeg version 8.0',
  amixNormalizeSupported: true
}

describe('forced hardware encoder failure (E2E only)', () => {
  it('is off unless both the E2E flag and the failure flag are set', () => {
    expect(hardwareEncoderFailureForced(ON)).toBe(true)
    expect(hardwareEncoderFailureForced({ AISS_E2E_FAIL_HW_ENCODER: '1' })).toBe(false)
    expect(hardwareEncoderFailureForced({ AISS_E2E: '1' })).toBe(false)
  })

  it('leaves the detected encoder alone when the switch is off', () => {
    expect(withForcedHardwareEncoder(software, {})).toEqual(software)
  })

  it('reports a hardware encoder when the switch is on', () => {
    const forced = withForcedHardwareEncoder(software, ON)
    expect(forced).toMatchObject({ encoder: 'h264_nvenc', hardware: true, fallback: false })
  })

  it('fails only encodes that use a hardware encoder, and only while the switch is on', () => {
    const hardwareArgs = ['-c:v', 'h264_nvenc', '-b:v', '8000k']
    const softwareArgs = ['-c:v', 'libx264', '-b:v', '8000k']
    expect(encodeFailsByForce(hardwareArgs, ON)).toBe(true)
    expect(encodeFailsByForce(softwareArgs, ON)).toBe(false)
    expect(encodeFailsByForce(hardwareArgs, {})).toBe(false)
  })
})
