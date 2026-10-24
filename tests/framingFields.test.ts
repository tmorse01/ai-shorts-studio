import { describe, expect, it } from 'vitest'
import {
  formatUnitPercent,
  formatZoom,
  parseUnitPercent,
  parseZoom
} from '@renderer/features/framing/framingFields'

describe('framing field text', () => {
  it('shows a position as a whole percentage of the room', () => {
    expect(formatUnitPercent(0)).toBe('0%')
    expect(formatUnitPercent(-0.4)).toBe('-40%')
    expect(formatUnitPercent(1)).toBe('100%')
  })

  it('parses a percentage back to a fraction, with or without the sign', () => {
    expect(parseUnitPercent('-40%')).toBeCloseTo(-0.4)
    expect(parseUnitPercent('25')).toBeCloseTo(0.25)
    expect(parseUnitPercent(' 100% ')).toBe(1)
    expect(parseUnitPercent('left')).toBeNull()
    expect(parseUnitPercent('')).toBeNull()
  })

  it('shows the zoom as a multiple with two decimals', () => {
    expect(formatZoom(1)).toBe('1.00×')
    expect(formatZoom(2.5)).toBe('2.50×')
  })

  it('parses a zoom with or without the multiple sign', () => {
    expect(parseZoom('2.5×')).toBe(2.5)
    expect(parseZoom('2x')).toBe(2)
    expect(parseZoom('3')).toBe(3)
    expect(parseZoom('-1')).toBeNull()
    expect(parseZoom('big')).toBeNull()
  })
})
