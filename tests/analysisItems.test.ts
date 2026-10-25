import { describe, expect, it } from 'vitest'
import { analysisItems } from '@renderer/features/analysis/analysisSync'
import type { MediaRef } from '@shared/project/schema'

function ref(overrides: Partial<MediaRef> & Pick<MediaRef, 'id' | 'kind'>): MediaRef {
  return {
    path: `${overrides.id}.mp4`,
    pathKind: 'relative',
    fileName: `${overrides.id}.mp4`,
    sizeBytes: 1,
    ...overrides
  }
}

describe('analysisItems', () => {
  it('leaves stills out of analysis, since they have no duration or audio to analyse', () => {
    const items = analysisItems('C:/proj', [
      ref({ id: 'clip', kind: 'video' }),
      ref({ id: 'still', kind: 'image', path: 'still.png', fileName: 'still.png' })
    ])
    expect(items).toEqual([{ id: 'clip', path: 'C:/proj/clip.mp4' }])
  })

  it('keeps absolute paths as they are and resolves relative ones against the project', () => {
    const items = analysisItems('C:/proj', [
      ref({ id: 'a', kind: 'audio', path: 'D:/music/a.m4a', pathKind: 'absolute' }),
      ref({ id: 'b', kind: 'video', path: 'b.mp4' })
    ])
    expect(items).toEqual([
      { id: 'a', path: 'D:/music/a.m4a' },
      { id: 'b', path: 'C:/proj/b.mp4' }
    ])
  })
})
