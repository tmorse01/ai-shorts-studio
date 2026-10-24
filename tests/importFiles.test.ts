import { describe, expect, it } from 'vitest'
import { mediaKindForFileName, planImport } from '@shared/media/importFiles'

describe('mediaKindForFileName', () => {
  it('maps video, audio and image extensions, ignoring case', () => {
    expect(mediaKindForFileName('Interview.MP4')).toBe('video')
    expect(mediaKindForFileName('voice.wav')).toBe('audio')
    expect(mediaKindForFileName('still.jpeg')).toBe('image')
  })

  it('returns null for unsupported or extensionless names', () => {
    expect(mediaKindForFileName('notes.txt')).toBeNull()
    expect(mediaKindForFileName('README')).toBeNull()
  })
})

describe('planImport', () => {
  const clip = { path: 'G:\\Footage\\clip.mp4', fileName: 'clip.mp4', sizeBytes: 100 }

  it('accepts supported files with their kind', () => {
    const plan = planImport([], [clip])
    expect(plan.accepted).toEqual([{ ...clip, kind: 'video' }])
    expect(plan.duplicates).toEqual([])
    expect(plan.rejected).toEqual([])
  })

  it('rejects unsupported files with a reason', () => {
    const plan = planImport([], [{ path: 'C:/a/doc.pdf', fileName: 'doc.pdf', sizeBytes: 5 }])
    expect(plan.accepted).toEqual([])
    expect(plan.rejected).toEqual([{ fileName: 'doc.pdf', reason: 'Unsupported file type.' }])
  })

  it('treats a file the project already holds as a duplicate when path and size match', () => {
    const existing = [{ path: 'g:/footage/CLIP.mp4', sizeBytes: 100 }]
    const plan = planImport(existing, [clip])
    expect(plan.accepted).toEqual([])
    expect(plan.duplicates).toEqual([clip])
  })

  it('imports a file with the same path but a different size', () => {
    const existing = [{ path: clip.path, sizeBytes: 999 }]
    expect(planImport(existing, [clip]).accepted).toHaveLength(1)
  })

  it('skips a repeat of a file earlier in the same batch', () => {
    const plan = planImport([], [clip, { ...clip }])
    expect(plan.accepted).toHaveLength(1)
    expect(plan.duplicates).toHaveLength(1)
  })
})
