import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { binaryCandidates, resolveBinary, type BinaryLocation } from '../src/main/media/binaries'
import { UserFacingError } from '../src/main/errors'

const devLocation: BinaryLocation = {
  isPackaged: false,
  appPath: join('G:', 'app'),
  resourcesPath: join('G:', 'app', 'out-resources')
}
const packagedLocation: BinaryLocation = {
  isPackaged: true,
  appPath: join('G:', 'app', 'resources', 'app.asar'),
  resourcesPath: join('G:', 'install', 'resources')
}

describe('binaryCandidates', () => {
  it('looks in resources/bin under the app folder in development', () => {
    const [candidate] = binaryCandidates('ffprobe', devLocation)
    expect(candidate).toBe(
      join(
        'G:',
        'app',
        'resources',
        'bin',
        process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
      )
    )
  })

  it('looks in bin under the resources folder in a packaged build', () => {
    const [candidate] = binaryCandidates('ffmpeg', packagedLocation)
    expect(candidate).toBe(
      join(
        'G:',
        'install',
        'resources',
        'bin',
        process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
      )
    )
  })
})

describe('resolveBinary', () => {
  it('returns the first candidate that exists', () => {
    const [expected] = binaryCandidates('ffmpeg', devLocation)
    expect(resolveBinary('ffmpeg', devLocation, (path) => path === expected)).toBe(expected)
  })

  it('throws a plain error that names the expected location when the tool is missing', () => {
    let caught: unknown
    try {
      resolveBinary('ffprobe', devLocation, () => false)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(UserFacingError)
    expect((caught as UserFacingError).details).toContain('pnpm fetch:bin')
  })
})
