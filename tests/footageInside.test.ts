import { describe, expect, it } from 'vitest'
import { footageInsideFolder } from '@shared/project/footageInside'
import type { MediaRef } from '@shared/project/schema'

function ref(id: string, path: string, pathKind: MediaRef['pathKind']): MediaRef {
  return { id, path, pathKind, kind: 'video' } as MediaRef
}

describe('footageInsideFolder', () => {
  const folder = 'D:\\Shoots\\Harbour'

  it('keeps relative footage that lives in the project folder', () => {
    const media = [ref('a', 'media/clip.mp4', 'relative')]
    expect(footageInsideFolder(media, folder).map((item) => item.id)).toEqual(['a'])
  })

  it('leaves out footage in the parent folder, even though it is stored relative', () => {
    const media = [ref('b', '../clip.mp4', 'relative')]
    expect(footageInsideFolder(media, folder)).toEqual([])
  })

  it('checks absolute paths against the folder, ignoring case and slash style', () => {
    const media = [
      ref('c', 'd:/shoots/harbour/Raw/cam.mov', 'absolute'),
      ref('d', 'E:/Cards/cam.mov', 'absolute'),
      ref('e', 'D:/Shoots/Harbour2/cam.mov', 'absolute')
    ]
    expect(footageInsideFolder(media, folder).map((item) => item.id)).toEqual(['c'])
  })

  it('does not count the folder itself or a sibling with the same prefix', () => {
    const media = [ref('f', 'D:/Shoots/Harbour', 'absolute')]
    expect(footageInsideFolder(media, folder)).toEqual([])
  })
})
