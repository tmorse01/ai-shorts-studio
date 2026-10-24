// Which footage lives inside a project folder. Those files move to the Recycle Bin with the folder,
// so the delete confirmation names them. Pure string work, so the renderer can use it too.
import type { MediaRef } from './schema'

// Lowercase, forward-slash, with "." and ".." segments folded away. Windows paths compare case-blind.
function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const drive = /^[a-zA-Z]:$/.test(parts[0] ?? '') ? parts.shift() : undefined
  return `${drive ?? ''}/${parts.join('/')}`.toLowerCase()
}

// The absolute form of a media ref's path, as normalize() reads it.
function absoluteOf(folderPath: string, ref: Pick<MediaRef, 'path' | 'pathKind'>): string {
  return ref.pathKind === 'relative' ? normalize(`${folderPath}/${ref.path}`) : normalize(ref.path)
}

// The media refs whose files sit inside the folder, in project order. A file that sits directly
// next to the folder, in its parent, is not inside it and is left out.
export function footageInsideFolder(media: readonly MediaRef[], folderPath: string): MediaRef[] {
  const root = normalize(folderPath)
  return media.filter((ref) => absoluteOf(folderPath, ref).startsWith(`${root}/`))
}
