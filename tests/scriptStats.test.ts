import { describe, expect, it } from 'vitest'
import type { Script } from '@shared/project/schema'
import {
  countWords,
  estimatedReadSeconds,
  formatReadTime,
  scriptWordCount
} from '@renderer/features/scripts/scriptStats'

const script = (texts: string[]): Pick<Script, 'lines'> => ({
  lines: texts.map((text, index) => ({ id: `l${index}`, text }))
})

describe('script word count', () => {
  it('counts words across lines and ignores extra spacing', () => {
    expect(countWords('  Hello   there  ')).toBe(2)
    expect(countWords('   ')).toBe(0)
    expect(scriptWordCount(script(['One two', '', 'three\nfour']))).toBe(4)
  })
})

describe('estimated read time', () => {
  it('uses 150 words a minute', () => {
    expect(estimatedReadSeconds(150)).toBe(60)
    expect(estimatedReadSeconds(0)).toBe(0)
  })

  it('formats seconds and minutes in plain language', () => {
    expect(formatReadTime(0)).toBe('0 sec')
    expect(formatReadTime(45)).toBe('45 sec')
    expect(formatReadTime(120)).toBe('2 min')
    expect(formatReadTime(125)).toBe('2 min 5 sec')
  })
})
