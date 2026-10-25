// End-to-end test mode. With AISS_E2E=1 the Claude, ElevenLabs and Parakeet providers are swapped for
// fakes, and native file pickers are replaced by picks the test wrote to the profile. FFmpeg always
// stays real. With the flag unset, nothing here changes behaviour. Pure, so the switch is unit tested
// without Electron.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const E2E_FLAG_ENV = 'AISS_E2E'
export const USER_DATA_ENV = 'AISS_USER_DATA'
/** The file, in the profile folder, that holds the paths the next file dialogs return. */
export const E2E_DIALOGS_FILE = 'e2e-dialogs.json'

export function isE2eMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[E2E_FLAG_ENV] === '1'
}

/** Set to 0 with AISS_E2E=1 to run without the Claude fake: no saved key, and the real client path. */
export const E2E_AI_ENV = 'AISS_E2E_AI'

/** True when Claude is the fake (E2E mode, and not switched off with AISS_E2E_AI=0). */
export function isE2eAiFakes(env: NodeJS.ProcessEnv = process.env): boolean {
  return isE2eMode(env) && env[E2E_AI_ENV] !== '0'
}

export interface IsolatedProfile {
  userData: string
  documents: string
}

/** The temp profile a test sets with AISS_USER_DATA, or null when the app uses its real folders. */
export function isolatedProfile(env: NodeJS.ProcessEnv = process.env): IsolatedProfile | null {
  const root = env[USER_DATA_ENV]
  if (!root) return null
  return { userData: root, documents: join(root, 'Documents') }
}

export interface DialogPicks {
  folder: string | null
  media: string[]
}

export const NO_PICKS: DialogPicks = { folder: null, media: [] }

const dialogPicksSchema = z.object({
  folder: z.string().nullable().optional(),
  media: z.array(z.string()).optional()
})

/** Reads the test's picks. Anything that does not match the shape means no picks, never a crash. */
export function parseDialogPicks(raw: unknown): DialogPicks {
  const parsed = dialogPicksSchema.safeParse(raw)
  if (!parsed.success) return NO_PICKS
  return { folder: parsed.data.folder ?? null, media: parsed.data.media ?? [] }
}

/** The picks in the profile's dialogs file. A missing or unreadable file means no picks. */
export function readDialogPicks(
  userData: string,
  readText: (file: string) => string = (file) => readFileSync(file, 'utf8')
): DialogPicks {
  try {
    return parseDialogPicks(JSON.parse(readText(join(userData, E2E_DIALOGS_FILE))))
  } catch {
    return NO_PICKS
  }
}
