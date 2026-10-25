import { describe, expect, it } from 'vitest'
import type { MediaRef } from '@shared/project/schema'
import { absoluteMediaPath, offlineMediaIds } from '@renderer/features/timeline/editorTimelineModel'

const relative: MediaRef = {
  id: 'rel',
  path: 'media/rel.mp4',
  pathKind: 'relative',
  fileName: 'rel.mp4',
  sizeBytes: 10,
  kind: 'video'
}
const absolute: MediaRef = {
  id: 'abs',
  path: 'D:/Footage/abs.mp4',
  pathKind: 'absolute',
  fileName: 'abs.mp4',
  sizeBytes: 10,
  kind: 'video'
}

describe('absoluteMediaPath', () => {
  it('joins relative paths onto the project folder and keeps absolute paths', () => {
    expect(absoluteMediaPath('C:/Projects/one', relative)).toBe('C:/Projects/one/media/rel.mp4')
    expect(absoluteMediaPath('C:/Projects/one', absolute)).toBe('D:/Footage/abs.mp4')
  })
})

describe('offlineMediaIds', () => {
  it('returns the ids of media whose resolved paths are reported missing', () => {
    const missing = ['C:/Projects/one/media/rel.mp4']
    expect(offlineMediaIds('C:/Projects/one', [relative, absolute], missing)).toEqual(['rel'])
  })

  it('returns nothing when every file is present', () => {
    expect(offlineMediaIds('C:/Projects/one', [relative, absolute], [])).toEqual([])
  })
})
