// Launches the built app (out/) through Playwright's _electron, with a fresh profile per test, and
// gives the spec the helpers the epic names. Each helper waits on the UI it drives.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { E2E_DIALOGS_FILE, E2E_FLAG_ENV, USER_DATA_ENV } from '../src/main/e2e/e2eMode'

// The folder with package.json. Electron reads "main" from it, so out/main/index.js runs.
export const REPO_ROOT = resolve(__dirname, '..')

export interface AppSession {
  app: ElectronApplication
  page: Page
  profileDir: string
  /** Creates a project from the dashboard and waits for its project home. */
  createProject: (name: string) => Promise<void>
  /** Imports files through the Footage section. The picker returns these paths. */
  importMedia: (paths: string[]) => Promise<void>
  /** Opens a short from the project home by its name. */
  openShort: (name: string) => Promise<void>
  close: () => Promise<void>
}

/** A fresh, empty profile folder for one test. */
export async function createProfileDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'aiss-e2e-'))
}

export async function launchApp(options: { profileDir: string }): Promise<AppSession> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RENDERER_URL') env[key] = value
  }
  env[E2E_FLAG_ENV] = '1'
  env[USER_DATA_ENV] = options.profileDir

  const app = await electron.launch({ args: [REPO_ROOT], env })
  const page = await app.firstWindow()

  async function setPicks(picks: { folder?: string | null; media?: string[] }): Promise<void> {
    await writeFile(join(options.profileDir, E2E_DIALOGS_FILE), JSON.stringify(picks), 'utf8')
  }

  return {
    app,
    page,
    profileDir: options.profileDir,
    async createProject(name) {
      await page.getByTestId('dashboard-new-project').click()
      await page.getByLabel('Name').fill(name)
      // The folder is suggested from the name after a short delay, and submit stays disabled until then.
      await expect(page.getByLabel('Folder')).not.toHaveValue('')
      await page.getByTestId('create-project-submit').click()
      await expect(page.getByTestId('project-home')).toBeVisible()
    },
    async importMedia(paths) {
      await setPicks({ media: paths })
      await page.getByTestId('footage-import').click()
    },
    async openShort(name) {
      // A short opens on double-click of its poster button (ShortCard), not on its name.
      await page.getByRole('button', { name: `Open ${name}`, exact: true }).dblclick()
    },
    async close() {
      await app.close()
    }
  }
}
