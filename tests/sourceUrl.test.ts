import { describe, expect, it } from 'vitest'
import { filePathFromSourceUrl, sourceUrlFor } from '@shared/media/sourceUrl'

describe('source URLs', () => {
  it('round-trips a Windows path with spaces and colons', () => {
    const file = 'G:\\Code\\My Project\\cache\\proxies\\a b.mp4'
    expect(filePathFromSourceUrl(sourceUrlFor(file))).toBe(file)
  })

  it('round-trips a POSIX path with percent signs', () => {
    const file = '/home/me/100%25 real.mov'
    expect(filePathFromSourceUrl(sourceUrlFor(file))).toBe(file)
  })

  it('rejects URLs from other schemes, other hosts and malformed input', () => {
    expect(filePathFromSourceUrl('file:///C:/clip.mp4')).toBeNull()
    expect(filePathFromSourceUrl('studio-media://other/abc')).toBeNull()
    expect(filePathFromSourceUrl('studio-media://source/')).toBeNull()
    expect(filePathFromSourceUrl('studio-media://source/%E0%A4%A')).toBeNull()
    expect(filePathFromSourceUrl('not a url')).toBeNull()
  })
})
