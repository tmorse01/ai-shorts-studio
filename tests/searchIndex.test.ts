import { describe, expect, it } from 'vitest'
import {
  SearchIndex,
  queryTermsOf,
  snippetFor,
  tokenize,
  type SearchDoc,
  type SearchKind
} from '@shared/search/searchIndex'

function doc(
  id: string,
  text: string,
  kind: SearchKind = 'segment',
  mediaId = 'clip-1',
  startMs = 0,
  endMs = 1000
): SearchDoc {
  return { id, mediaId, kind, text, startMs, endMs }
}

describe('tokenize', () => {
  it('splits into lower-case words with their offsets', () => {
    const tokens = tokenize("Hello, World's end")
    expect(tokens.map((token) => token.term)).toEqual(['hello', 'world', 's', 'end'])
    expect(tokens[1]).toEqual({ term: 'world', start: 7, end: 12 })
  })

  it('keeps letters from any script', () => {
    expect(queryTermsOf('Café 東京')).toEqual(['café', '東京'])
  })
})

describe('SearchIndex matching', () => {
  it('finds nothing for an empty query', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'stadium crowd')])
    expect(index.search('   ')).toEqual([])
  })

  it('matches words by prefix and ignores case', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'The stadium crowd was loud')])
    expect(index.search('STAD')).toHaveLength(1)
    expect(index.search('stadium')).toHaveLength(1)
    expect(index.search('stadiumx')).toEqual([])
  })

  it('requires every query word to match', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'crowd cheers loudly'), doc('b', 'crowd goes quiet')])
    expect(index.search('crowd cheer').map((hit) => hit.id)).toEqual(['a'])
    expect(index.search('crowd rain')).toEqual([])
  })

  it('finds a prefix among many terms', () => {
    const index = new SearchIndex()
    const docs = Array.from({ length: 1000 }, (_unused, i) => doc(`d${i}`, `item${i}`))
    index.replaceGroup('clip-1', docs)
    // item1, item10 to item19 and item100 to item199 all start with "item1".
    expect(index.search('item1', 500)).toHaveLength(111)
    expect(index.search('item999')).toHaveLength(1)
  })
})

describe('SearchIndex ranking', () => {
  it('ranks a moment name above a transcript segment with the same word', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('seg', 'the stadium', 'segment')])
    index.replaceGroup('clip-2', [doc('moment', 'Stadium intro', 'moment', 'clip-2')])
    const hits = index.search('stadium')
    expect(hits.map((hit) => hit.id)).toEqual(['moment', 'seg'])
    expect(hits[0].score).toBeGreaterThan(hits[1].score)
  })

  it('ranks a document with more hits of a word higher', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('once', 'rain falls'), doc('thrice', 'rain rain rain')])
    expect(index.search('rain').map((hit) => hit.id)).toEqual(['thrice', 'once'])
  })

  it('ranks a whole-word match above a longer word it prefixes', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('plural', 'cars parked'), doc('exact', 'car parked')])
    expect(index.search('car').map((hit) => hit.id)).toEqual(['exact', 'plural'])
  })

  it('returns at most the limit, best first', () => {
    const index = new SearchIndex()
    index.replaceGroup(
      'clip-1',
      Array.from({ length: 10 }, (_unused, i) => doc(`d${i}`, `wave ${i}`))
    )
    expect(index.search('wave', 3)).toHaveLength(3)
  })
})

describe('SearchIndex updates', () => {
  it('replaces only the documents of the group it is given', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'old words')])
    index.replaceGroup('clip-2', [doc('b', 'other clip')])
    index.replaceGroup('clip-1', [doc('a2', 'fresh words', 'segment')])

    expect(index.search('old')).toEqual([])
    expect(index.search('fresh').map((hit) => hit.id)).toEqual(['a2'])
    expect(index.search('other').map((hit) => hit.id)).toEqual(['b'])
    expect(index.size).toBe(2)
  })

  it('removes a group and its terms', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'harbour lights')])
    index.removeGroup('clip-1')
    expect(index.search('harbour')).toEqual([])
    expect(index.size).toBe(0)
  })

  it('keeps the source range of each hit', () => {
    const index = new SearchIndex()
    index.replaceGroup('clip-1', [doc('a', 'hello there', 'shot', 'clip-1', 2000, 4500)])
    expect(index.search('hello')[0]).toMatchObject({
      mediaId: 'clip-1',
      startMs: 2000,
      endMs: 4500
    })
  })
})

describe('snippetFor', () => {
  it('marks the matching words and keeps the rest as plain text', () => {
    expect(snippetFor('the stadium was loud', ['stad'])).toEqual([
      { text: 'the ', match: false },
      { text: 'stadium', match: true },
      { text: ' was loud', match: false }
    ])
  })

  it('returns the whole text unmarked when nothing matches', () => {
    expect(snippetFor('quiet room', ['stadium'])).toEqual([{ text: 'quiet room', match: false }])
  })

  it('cuts a long text around the match, with ellipses at the cut', () => {
    const text = `${'alpha '.repeat(30)}target ${'omega '.repeat(30)}`
    const parts = snippetFor(text, ['target'], 60)
    const shown = parts.map((part) => part.text).join('')
    expect(shown.length).toBeLessThanOrEqual(60 + 2)
    expect(parts.find((part) => part.match)?.text).toBe('target')
    expect(parts[0]).toEqual({ text: '…', match: false })
    expect(parts[parts.length - 1]).toEqual({ text: '…', match: false })
  })
})
