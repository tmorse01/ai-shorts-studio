import { describe, expect, it } from 'vitest'
import { parseShotFrameName, shotFrameName } from '@shared/analysis/shots'
import {
  batchItems,
  buildVisionPrompt,
  parseVisionReply,
  retryDelayMs,
  sameFrames,
  visionResultFileSchema
} from '@shared/analysis/vision'

describe('vision batching', () => {
  it('splits shots into groups of at most the batch size, in order', () => {
    expect(batchItems([0, 1, 2, 3, 4, 5, 6], 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]])
    expect(batchItems([0, 1], 5)).toEqual([[0, 1]])
    expect(batchItems([], 5)).toEqual([])
  })

  it('never makes an empty or endless batch from a bad size', () => {
    expect(batchItems([0, 1, 2], 0)).toEqual([[0], [1], [2]])
  })
})

describe('retry backoff', () => {
  it('doubles from one second and stops at the cap', () => {
    expect([1, 2, 3, 4].map((retry) => retryDelayMs(retry))).toEqual([1000, 2000, 4000, 8000])
    expect(retryDelayMs(10)).toBe(30000)
  })

  it('waits as long as the server asks, up to a longer cap', () => {
    expect(retryDelayMs(1, 2500)).toBe(2500)
    expect(retryDelayMs(1, 500)).toBe(1000)
    expect(retryDelayMs(1, 600000)).toBe(60000)
  })
})

describe('saved frame check', () => {
  it('matches only when the same frames with the same modified times are still there', () => {
    const saved = [
      { name: 'shot-0000-0.jpg', mtimeMs: 10 },
      { name: 'shot-0000-1.jpg', mtimeMs: 10 }
    ]
    expect(sameFrames(saved, [...saved])).toBe(true)
    expect(sameFrames(saved, [saved[0]])).toBe(false)
    expect(sameFrames(saved, [saved[0], { ...saved[1], mtimeMs: 11 }])).toBe(false)
  })
})

describe('frame file names', () => {
  it('reads back the shot and frame numbers it was written with', () => {
    expect(parseShotFrameName(shotFrameName(12, 2))).toEqual({ shotIndex: 12, frameIndex: 2 })
    expect(parseShotFrameName('thumb.jpg')).toBeUndefined()
    expect(parseShotFrameName('shot-0001-0.png')).toBeUndefined()
  })
})

describe('vision reply', () => {
  it('reads the JSON array even when the reply adds text or a code fence around it', () => {
    const text = [
      'Sure, here are the shots:',
      '```json',
      '[{"shot": 0, "description": "A man walks in", "tags": ["indoor", "wide"]},',
      ' {"shot": 1, "description": "Close-up of a mug", "tags": []}]',
      '```'
    ].join('\n')

    expect(parseVisionReply(text, [0, 1])).toEqual([
      { shotIndex: 0, description: 'A man walks in', tags: ['indoor', 'wide'] },
      { shotIndex: 1, description: 'Close-up of a mug', tags: [] }
    ])
  })

  it('drops shots it was not asked about, duplicates and malformed entries', () => {
    const text =
      '[{"shot": 0, "description": "first", "tags": []},' +
      ' {"shot": 0, "description": "again", "tags": []},' +
      ' {"shot": 9, "description": "not asked", "tags": []},' +
      ' {"shot": 1, "description": "", "tags": []},' +
      ' {"shot": 2, "description": "fine", "tags": ["x"]}]'

    expect(parseVisionReply(text, [0, 1, 2])).toEqual([
      { shotIndex: 0, description: 'first', tags: [] },
      { shotIndex: 2, description: 'fine', tags: ['x'] }
    ])
  })

  it('returns undefined when no JSON array can be read', () => {
    expect(parseVisionReply('I cannot see any frames.', [0])).toBeUndefined()
    expect(parseVisionReply('[not json]', [0])).toBeUndefined()
  })

  it('leaves out shots the reply did not mention', () => {
    expect(parseVisionReply('[{"shot": 1, "description": "d", "tags": []}]', [0, 1])).toEqual([
      { shotIndex: 1, description: 'd', tags: [] }
    ])
  })
})

describe('vision prompt and result file', () => {
  it('names the shots it asks about and asks for JSON only', () => {
    const prompt = buildVisionPrompt([3, 4])
    expect(prompt).toContain('(3, 4)')
    expect(prompt).toContain('JSON array')
  })

  it('keeps the saved result in the shape the stage writes', () => {
    const parsed = visionResultFileSchema.safeParse({
      model: 'claude-haiku-5-5',
      shots: [
        {
          shotIndex: 0,
          description: 'A kitchen',
          tags: ['indoor'],
          frames: [{ name: 'shot-0000-0.jpg', mtimeMs: 1 }]
        }
      ]
    })
    expect(parsed.success).toBe(true)
    expect(visionResultFileSchema.safeParse({ model: 'gpt', shots: [] }).success).toBe(false)
  })
})
