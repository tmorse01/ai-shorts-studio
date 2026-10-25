// Reads and writes the shared export settings (presets, naming, output folder). A missing or damaged
// file means "no saved settings", so the app starts with the defaults instead of failing.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { exportSettingsSchema, type ExportSettings } from '@shared/export/exportSettings'

export async function readExportSettingsFile(file: string): Promise<ExportSettings | null> {
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
  // Files saved before the SRT option existed have no includeSrt, so it reads as off.
  const withDefaults =
    typeof json === 'object' && json !== null && !Array.isArray(json)
      ? { includeSrt: false, ...json }
      : json
  const parsed = exportSettingsSchema.safeParse(withDefaults)
  return parsed.success ? parsed.data : null
}

export async function writeExportSettingsFile(
  file: string,
  settings: ExportSettings
): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(settings, null, 2), 'utf8')
}
