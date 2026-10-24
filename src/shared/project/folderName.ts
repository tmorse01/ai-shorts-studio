// Where a new project goes by default: <Documents>/AI Shorts Studio/<name>. Pure, so the folder
// rule is tested directly. Characters Windows does not allow in a folder name become dashes.
const UNSAFE_PUNCTUATION = '<>:"/\\|?*'
const FIRST_PRINTABLE_CODE = 32

export const DEFAULT_PROJECTS_DIR = 'AI Shorts Studio'

export function safeFolderName(name: string): string {
  const withoutUnsafe = Array.from(name, (char) =>
    char.charCodeAt(0) < FIRST_PRINTABLE_CODE || UNSAFE_PUNCTUATION.includes(char) ? '-' : char
  ).join('')
  const cleaned = withoutUnsafe.replace(/[. ]+$/, '').trim()
  return cleaned.length > 0 ? cleaned : 'Untitled project'
}
