// Serves footage to the renderer under the studio-media scheme. Only files that a media:source
// request has allowed can be read, so the renderer cannot ask for arbitrary paths. Electron's
// protocol handler is registered in src/main/index.ts; this module holds the allowlist.
import { filePathFromSourceUrl, sourceUrlFor } from '@shared/media/sourceUrl'

const allowedFiles = new Set<string>()

// Allows a file for playback and returns the URL the renderer loads it from.
export function allowSourceFile(filePath: string): string {
  allowedFiles.add(filePath)
  return sourceUrlFor(filePath)
}

// The file a studio-media URL names, or null when it is not a URL for an allowed file.
export function allowedSourceFile(url: string): string | null {
  const filePath = filePathFromSourceUrl(url)
  return filePath !== null && allowedFiles.has(filePath) ? filePath : null
}
