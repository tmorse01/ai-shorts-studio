import { describe, expect, it } from 'vitest'
import { formatDuration } from '@renderer/features/dashboard/formatDuration'
import { footageDurationMs } from '@shared/project/recentProjects'
import type { MediaRef } from '@shared/project/schema'

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(61_250)).toBe('1:01')
    expect(formatDuration(59_600)).toBe('1:00')
  })

  it('adds hours from one hour up', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })
})

describe('footageDurationMs', () => {
  const base = { path: 'a.mp4', pathKind: 'relative', fileName: 'a.mp4', sizeBytes: 1 } as const
  const media = (id: string, kind: MediaRef['kind'], durationMs?: number): MediaRef => ({
    ...base,
    id,
    kind,
    durationMs
  })

  it('sums video footage and ignores audio, images and untimed files', () => {
    expect(
      footageDurationMs([
        media('v1', 'video', 10_000),
        media('v2', 'video', 2_500),
        media('a1', 'audio', 99_000),
        media('i1', 'image'),
        media('v3', 'video')
      ])
    ).toBe(12_500)
  })

  it('is undefined when no video has a known length', () => {
    expect(footageDurationMs([media('a1', 'audio', 5_000)])).toBeUndefined()
    expect(footageDurationMs([])).toBeUndefined()
  })
})
