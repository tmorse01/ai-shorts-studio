// Reads and writes the main window's saved bounds. A missing or damaged file means "no saved
// state", so the window opens at its default size instead of failing.
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { windowStateSchema, type WindowState } from '@shared/windowState'

export async function readWindowStateFile(file: string): Promise<WindowState | null> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }

  const parsed = windowStateSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export async function writeWindowStateFile(file: string, state: WindowState): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2), 'utf8')
}

// Used when the window closes, where an async write could be cut off by quitting.
export function writeWindowStateSync(file: string, state: WindowState): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}
