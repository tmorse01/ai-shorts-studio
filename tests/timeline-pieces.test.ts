import { describe, expect, it } from 'vitest'
import { timelinePieces } from '../src/main/ffmpeg'

describe('export pieces', () => {
  it('fills the blank space between cuts and at the end with gap pieces', () => {
    const pieces = timelinePieces(
      [
        { startSec: 10, endSec: 20, atSec: 0 },
        { startSec: 40, endSec: 45, atSec: 15 }
      ],
      30
    )
    expect(pieces).toEqual([
      { kind: 'cut', seg: { startSec: 10, endSec: 20, atSec: 0 } },
      { kind: 'gap', sec: 5 },
      { kind: 'cut', seg: { startSec: 40, endSec: 45, atSec: 15 } },
      { kind: 'gap', sec: 10 }
    ])
  })

  it('plays cuts in placement order, not the order they were added', () => {
    const pieces = timelinePieces(
      [
        { startSec: 40, endSec: 45, atSec: 10 },
        { startSec: 10, endSec: 20, atSec: 0 }
      ],
      15
    )
    expect(pieces.map((p) => (p.kind === 'cut' ? p.seg.startSec : p.sec))).toEqual([10, 40])
  })

  it('makes a single gap for a short with no cut at its start', () => {
    expect(timelinePieces([{ startSec: 0, endSec: 10, atSec: 5 }], 15)).toEqual([
      { kind: 'gap', sec: 5 },
      { kind: 'cut', seg: { startSec: 0, endSec: 10, atSec: 5 } }
    ])
  })
})
