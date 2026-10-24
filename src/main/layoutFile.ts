// Reads and writes the saved editor layout. A missing or damaged file means "no saved layout", so
// the app starts with its defaults instead of failing.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { uiLayoutSchema, type UiLayout } from '@shared/layout'

export async function readLayoutFile(file: string): Promise<UiLayout | null> {
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

  const parsed = uiLayoutSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export async function writeLayoutFile(file: string, layout: UiLayout): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(layout, null, 2), 'utf8')
}
