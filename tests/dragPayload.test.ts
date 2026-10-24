import { describe, expect, it } from 'vitest'
import {
  carriesFootage,
  clipPayload,
  decodeDragPayload,
  DRAG_MIME,
  encodeDragPayload,
  momentPayload,
  rangePayload
} from '@shared/timeline/dragPayload'

describe('footage drag payloads', () => {
  it('round-trips a clip, a range and a moment', () => {
    const payloads = [
      clipPayload('m1', 12_345.4),
      rangePayload('m1', 1000, 4000),
      momentPayload({ id: 'mo1', mediaId: 'm1', inMs: 500, outMs: 2500 })
    ]
    for (const payload of payloads) {
      expect(decodeDragPayload(encodeDragPayload(payload))).toEqual(payload)
    }
  })

  it('makes a clip cover the whole footage item', () => {
    expect(clipPayload('m1', 12_345.4)).toEqual({
      kind: 'clip',
      mediaId: 'm1',
      inMs: 0,
      outMs: 12345
    })
  })

  it('keeps the moment id on a moment payload', () => {
    expect(momentPayload({ id: 'mo1', mediaId: 'm1', inMs: 0, outMs: 10 })).toMatchObject({
      kind: 'moment',
      momentId: 'mo1'
    })
  })

  it('rejects text that is not a payload', () => {
    expect(decodeDragPayload('not json')).toBeNull()
    expect(decodeDragPayload('{"kind":"clip"}')).toBeNull()
    expect(decodeDragPayload('{"kind":"unknown","mediaId":"m1","inMs":0,"outMs":5}')).toBeNull()
    expect(decodeDragPayload('{"kind":"range","mediaId":"","inMs":0,"outMs":5}')).toBeNull()
    expect(decodeDragPayload('{"kind":"range","mediaId":"m1","inMs":-1,"outMs":5}')).toBeNull()
  })

  it('rejects an empty or reversed range', () => {
    expect(decodeDragPayload('{"kind":"range","mediaId":"m1","inMs":5,"outMs":5}')).toBeNull()
    expect(decodeDragPayload('{"kind":"range","mediaId":"m1","inMs":9,"outMs":5}')).toBeNull()
  })

  it('recognises footage drags by MIME type only', () => {
    expect(carriesFootage([DRAG_MIME])).toBe(true)
    expect(carriesFootage(['Files'])).toBe(false)
    expect(carriesFootage(['text/plain'])).toBe(false)
  })
})
