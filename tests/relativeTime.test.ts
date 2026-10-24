import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '@renderer/features/dashboard/relativeTime'

const now = new Date('2026-10-24T12:00:00.000Z')

function ago(ms: number): string {
  return new Date(now.getTime() - ms).toISOString()
}

describe('formatRelativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [5 * 60_000, '5m ago'],
    [3 * 3_600_000, '3h ago'],
    [2 * 86_400_000, '2d ago'],
    [29 * 86_400_000, '29d ago']
  ])('%i ms before now reads as %s', (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), now)).toBe(expected)
  })

  it('falls back to a date after 30 days', () => {
    const text = formatRelativeTime(ago(45 * 86_400_000), now)
    expect(text).not.toMatch(/ago$/)
    expect(text).toMatch(/\d{4}/)
  })
})
