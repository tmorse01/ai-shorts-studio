// Finds the bundled FFmpeg and FFprobe binaries. Pure, so the lookup order is tested without Electron.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { UserFacingError } from '../errors'

export type BinaryName = 'ffmpeg' | 'ffprobe'

export interface BinaryLocation {
  isPackaged: boolean
  /** The app folder. In development the binaries sit in resources/bin under it. */
  appPath: string
  /** Electron's resources folder. In a packaged build the binaries sit in bin under it. */
  resourcesPath: string
}

export function binaryCandidates(name: BinaryName, location: BinaryLocation): string[] {
  const file = process.platform === 'win32' ? `${name}.exe` : name
  return location.isPackaged
    ? [join(location.resourcesPath, 'bin', file)]
    : [join(location.appPath, 'resources', 'bin', file)]
}

export function resolveBinary(
  name: BinaryName,
  location: BinaryLocation,
  exists: (path: string) => boolean = existsSync
): string {
  const candidates = binaryCandidates(name, location)
  const found = candidates.find((candidate) => exists(candidate))
  if (!found) {
    throw new UserFacingError(
      'The media tools are missing from this build.',
      `${name} was not found at ${candidates.join(' or ')}. In development, run "pnpm fetch:bin".`
    )
  }
  return found
}
