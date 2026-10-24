import { describe, expect, it } from 'vitest'
import type { TranscriptWord } from '@shared/analysis/transcript'
import type { CaptionBlock } from '@shared/captions/captionBlock'
import {
  captionBlocksForClips,
  captionWordsForClips,
  clipsSpan,
  remapClipWords,
  replaceCaptionsInRange,
  type CaptionSourceClip
} from '@shared/captions/captionRemap'

const words: TranscriptWord[] = [
  { text: 'Before', startMs: 0, endMs: 400 },
  { text: 'hello', startMs: 5000, endMs: 5400 },
  { text: 'world.', startMs: 5500, endMs: 6000 },
  { text: 'Runs', startMs: 7800, endMs: 8400 }
]

function block(id: string, startMs: number): CaptionBlock {
  return { id, words: [{ text: id, startMs, endMs: startMs + 100 }] }
}

describe('remapClipWords', () => {
  it('shifts source words by the clip offset (timeline start minus source in)', () => {
    const clip = { mediaId: 'm', startMs: 1000, durationMs: 2000, sourceInMs: 4000 }
    expect(remapClipWords(words, clip)).toEqual([
      { text: 'hello', startMs: 2000, endMs: 2400 },
      { text: 'world.', startMs: 2500, endMs: 3000 }
    ])
  })

  it('drops words that start outside the source window', () => {
    const clip = { mediaId: 'm', startMs: 0, durationMs: 1000, sourceInMs: 0 }
    expect(remapClipWords(words, clip).map((word) => word.text)).toEqual(['Before'])
  })

  it('cuts a word that runs past the end of the clip at the clip end', () => {
    const clip = { mediaId: 'm', startMs: 0, durationMs: 1000, sourceInMs: 7000 }
    expect(remapClipWords(words, clip)).toEqual([{ text: 'Runs', startMs: 800, endMs: 1000 }])
  })

  it('keeps end at or after start when the transcript end is before its start', () => {
    const odd: TranscriptWord[] = [{ text: 'odd', startMs: 100, endMs: 50 }]
    const clip = { mediaId: 'm', startMs: 0, durationMs: 1000, sourceInMs: 0 }
    expect(remapClipWords(odd, clip)).toEqual([{ text: 'odd', startMs: 100, endMs: 100 }])
  })
})

describe('captionWordsForClips', () => {
  const clipA: CaptionSourceClip = { mediaId: 'a', startMs: 0, durationMs: 1000, sourceInMs: 0 }
  const clipB: CaptionSourceClip = { mediaId: 'b', startMs: 3000, durationMs: 1000, sourceInMs: 0 }
  const wordA: TranscriptWord = { text: 'first', startMs: 100, endMs: 300 }
  const wordB: TranscriptWord = { text: 'second', startMs: 100, endMs: 300 }

  it('orders words by timeline time, whatever order the clips are given in', () => {
    const byMedia = new Map([
      ['a', [wordA]],
      ['b', [wordB]]
    ])
    const texts = captionWordsForClips([clipB, clipA], byMedia).map((word) => word.text)
    expect(texts).toEqual(['first', 'second'])
  })

  it('adds nothing for a clip whose media has no transcript', () => {
    const texts = captionWordsForClips([clipA, clipB], new Map([['a', [wordA]]]))
    expect(texts.map((word) => word.text)).toEqual(['first'])
  })
})

describe('clipsSpan', () => {
  it('spans from the first clip start to the last clip end', () => {
    const span = clipsSpan([
      { mediaId: 'a', startMs: 2000, durationMs: 500, sourceInMs: 0 },
      { mediaId: 'b', startMs: 0, durationMs: 1000, sourceInMs: 0 }
    ])
    expect(span).toEqual({ startMs: 0, endMs: 2500 })
  })

  it('is undefined with no clips', () => {
    expect(clipsSpan([])).toBeUndefined()
  })
})

describe('captionBlocksForClips', () => {
  it('chunks the remapped words and gives each block a new id', () => {
    const clip: CaptionSourceClip = { mediaId: 'm', startMs: 0, durationMs: 9000, sourceInMs: 0 }
    let n = 0
    const blocks = captionBlocksForClips([clip], new Map([['m', words]]), () => `c${++n}`)
    expect(blocks.map((item) => item.id)).toEqual(['c1', 'c2', 'c3'])
    expect(blocks[0].words.map((word) => word.text)).toEqual(['Before'])
    expect(blocks[1].words.map((word) => word.text)).toEqual(['hello', 'world.'])
  })
})

describe('replaceCaptionsInRange', () => {
  it('replaces blocks that start inside the range and keeps the rest in time order', () => {
    const existing = [block('a', 0), block('b', 1000), block('c', 3000)]
    const next = [block('n1', 1500), block('n2', 2200)]
    const ids = replaceCaptionsInRange(existing, 1000, 3000, next).map((item) => item.id)
    expect(ids).toEqual(['a', 'n1', 'n2', 'c'])
  })

  it('treats the range start as inside and the range end as outside', () => {
    const existing = [block('start', 1000), block('end', 3000)]
    const ids = replaceCaptionsInRange(existing, 1000, 3000, []).map((item) => item.id)
    expect(ids).toEqual(['end'])
  })

  it('removes captions in the range when there is nothing to put back', () => {
    const existing = [block('a', 500), block('b', 9000)]
    expect(replaceCaptionsInRange(existing, 0, 1000, []).map((item) => item.id)).toEqual(['b'])
  })
})
