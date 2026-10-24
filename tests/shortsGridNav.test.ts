import { describe, expect, it } from 'vitest'
import { nextCardIndex } from '@renderer/features/shorts/shortsGridNav'

describe('nextCardIndex', () => {
  it('moves one card left and right, clamped to the grid', () => {
    expect(nextCardIndex('ArrowRight', 1, 4, 2)).toBe(2)
    expect(nextCardIndex('ArrowLeft', 1, 4, 2)).toBe(0)
    expect(nextCardIndex('ArrowLeft', 0, 4, 2)).toBe(0)
    expect(nextCardIndex('ArrowRight', 3, 4, 2)).toBe(3)
  })

  it('moves one row up and down by the column count', () => {
    expect(nextCardIndex('ArrowDown', 0, 5, 3)).toBe(3)
    expect(nextCardIndex('ArrowUp', 4, 5, 3)).toBe(1)
    expect(nextCardIndex('ArrowDown', 4, 5, 3)).toBe(4)
  })

  it('returns null for keys that are not arrows, and when nothing is focused', () => {
    expect(nextCardIndex('Enter', 0, 3, 2)).toBeNull()
    expect(nextCardIndex('ArrowRight', -1, 3, 2)).toBeNull()
    expect(nextCardIndex('ArrowRight', 0, 0, 2)).toBeNull()
  })
})
