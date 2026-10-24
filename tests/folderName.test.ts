import { describe, expect, it } from 'vitest'
import { safeFolderName } from '@shared/project/folderName'

describe('safeFolderName', () => {
  it('keeps a plain name as it is', () => {
    expect(safeFolderName('Harbour shoot')).toBe('Harbour shoot')
  })

  it('replaces characters Windows does not allow in folder names', () => {
    expect(safeFolderName('Cut: 1/2 <final>?')).toBe('Cut- 1-2 -final--')
  })

  it('drops trailing dots and spaces, which Windows strips from folder names', () => {
    expect(safeFolderName('Trailer. ')).toBe('Trailer')
  })

  it('falls back to a default when nothing usable is left', () => {
    expect(safeFolderName('...  ')).toBe('Untitled project')
  })
})
