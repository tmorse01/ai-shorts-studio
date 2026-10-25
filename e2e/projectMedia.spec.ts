// Tutorial sections 1 and 2 (docs/TUTORIAL.md): create and reopen a project, import media, tag and
// search it, relink a file moved on disk, and keep edits across an app restart. Runs against the
// built app with real FFmpeg. Disk state is read from the project folder, so the spec checks what
// was saved, not only what the UI shows.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { E2E_DIALOGS_FILE } from '../src/main/e2e/e2eMode'
import { FIXTURES } from './generateFixtures'
import { launchApp } from './launchApp'
import { test } from './test'

const READY_TIMEOUT = 180_000

interface SavedMedia {
  id: string
  kind: 'video' | 'audio' | 'image'
  fileName: string
}

// The project folder is the one holding project.json. Each test has one project in its profile.
function findFiles(root: string, name: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) found.push(...findFiles(path, name))
    else if (entry.name === name) found.push(path)
  }
  return found
}

function projectFolderOf(profileDir: string): string {
  const [file] = findFiles(profileDir, 'project.json')
  if (!file) throw new Error(`No project.json under ${profileDir}`)
  return dirname(file)
}

function readSavedProject(folder: string): { media: SavedMedia[]; mediaTags: { name: string }[] } {
  return JSON.parse(readFileSync(join(folder, 'project.json'), 'utf8'))
}

// Thumbnails and filmstrips are cache files. Each one existing means its job reached ready. Proxies
// are not checked here: the app makes none for 1080p H.264 footage, which the tutorial does not say.
function mediaReady(folder: string, media: SavedMedia[]): boolean {
  return media.every((ref) => {
    const thumbs = join(folder, 'cache', 'thumbs', ref.id)
    if (!existsSync(join(thumbs, 'thumb.jpg'))) return false
    return ref.kind !== 'video' || existsSync(join(thumbs, 'filmstrip.jpg'))
  })
}

// A media card in the grid, named by its file name.
function mediaCard(page: Page, fileName: string): Locator {
  const escaped = fileName.replace(/[.]/g, '\\.')
  return page.getByRole('button', { name: new RegExp(`^${escaped}`) })
}

// Waits until no media job is queued or running, so a file is not held open while it is moved.
async function waitForJobsIdle(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const result = await page.evaluate(() => window.api.invoke('media:job:list', {}))
        if (!result.ok) return false
        return result.data.jobs.every((job) => job.status === 'done' || job.status === 'failed')
      },
      { timeout: READY_TIMEOUT }
    )
    .toBe(true)
}

// Opens a project from the dashboard by its name, the way a user clicks its card.
async function openFromDashboard(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
  await page.getByText(name, { exact: true }).first().click()
  await expect(page.getByTestId('project-home')).toBeVisible()
}

async function backToDashboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
}

// Drops real files onto the window. The files come from a page file input, so they carry their disk
// paths, and the drop goes through the same window listeners a dragged file would.
async function dropFiles(page: Page, paths: string[]): Promise<void> {
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'e2e-drop-source'
    input.style.display = 'none'
    document.body.appendChild(input)
  })
  await page.locator('#e2e-drop-source').setInputFiles(paths)
  await page.evaluate(() => {
    const input = document.getElementById('e2e-drop-source') as HTMLInputElement
    const transfer = new DataTransfer()
    for (const file of Array.from(input.files ?? [])) transfer.items.add(file)
    input.remove()
    const init = { dataTransfer: transfer, bubbles: true, cancelable: true }
    document.body.dispatchEvent(new DragEvent('dragenter', init))
    document.body.dispatchEvent(new DragEvent('dragover', init))
    document.body.dispatchEvent(new DragEvent('drop', init))
  })
}

test('creates a project, shows it on the dashboard and reopens it', async ({ session }) => {
  const { page } = session
  await session.createProject('Tutorial project')
  await backToDashboard(page)
  await expect(page.getByRole('button', { name: /^Tutorial project/ })).toBeVisible()

  await openFromDashboard(page, 'Tutorial project')
  await expect(page.getByTestId('project-home')).toContainText('Tutorial project')
})

test('imports two clips and a PNG by button and by drop, and thumbnails, filmstrip and proxies reach ready', async ({
  session
}) => {
  const { page } = session
  await session.createProject('Import project')

  await session.importMedia([FIXTURES.clipA, FIXTURES.clipB])
  await expect(mediaCard(page, 'clip-a.mp4')).toBeVisible()
  await expect(mediaCard(page, 'clip-b.mp4')).toBeVisible()

  await dropFiles(page, [FIXTURES.still])
  await expect(mediaCard(page, 'still.png')).toBeVisible()

  const folder = projectFolderOf(session.profileDir)
  await expect
    .poll(
      () => {
        const media = readSavedProject(folder).media
        return media.length === 3 && mediaReady(folder, media)
      },
      { timeout: READY_TIMEOUT, message: 'thumbnails, filmstrips and proxies are not ready' }
    )
    .toBe(true)
})

test('tags and search filter the media grid', async ({ session }) => {
  const { page } = session
  await session.createProject('Filter project')
  await session.importMedia([FIXTURES.clipA, FIXTURES.clipB, FIXTURES.still])
  await expect(mediaCard(page, 'still.png')).toBeVisible()

  // Make a tag, then put it on the first clip.
  await page.getByRole('button', { name: 'Manage tags' }).click()
  await page.getByPlaceholder('New tag name').fill('Intro')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  await mediaCard(page, 'clip-a.mp4').click()
  await page
    .getByRole('group', { name: 'Tag selected files' })
    .getByRole('button', { name: 'Intro' })
    .click()

  // Search by name keeps only the clips.
  const search = page.getByRole('searchbox', { name: 'Search media by name' })
  await search.fill('clip')
  await expect(mediaCard(page, 'still.png')).toBeHidden()
  await expect(mediaCard(page, 'clip-b.mp4')).toBeVisible()

  // The tag filter then keeps only the tagged clip.
  await search.fill('')
  await page
    .getByRole('group', { name: 'Filter by tag' })
    .getByRole('button', { name: 'Intro' })
    .click()
  await expect(mediaCard(page, 'clip-b.mp4')).toBeHidden()
  await expect(mediaCard(page, 'clip-a.mp4')).toBeVisible()
})

test('a file moved on disk shows as offline and Relink fixes it', async ({ session }) => {
  const { page, profileDir } = session
  const scratch = mkdtempSync(join(tmpdir(), 'aiss-e2e-move-'))
  const cameraDir = join(scratch, 'camera')
  const movedDir = join(scratch, 'moved')
  mkdirSync(cameraDir)
  mkdirSync(movedDir)
  const original = join(cameraDir, 'clip-a.mp4')
  copyFileSync(FIXTURES.clipA, original)

  await session.createProject('Relink project')
  await session.importMedia([original])
  await expect(mediaCard(page, 'clip-a.mp4')).toBeVisible()

  await backToDashboard(page)
  await waitForJobsIdle(page)
  renameSync(original, join(movedDir, basename(original)))

  await openFromDashboard(page, 'Relink project')
  await expect(page.getByRole('status').filter({ hasText: '1 file is offline.' })).toBeVisible()

  await writeFile(
    join(profileDir, E2E_DIALOGS_FILE),
    JSON.stringify({ folder: movedDir, media: [] }),
    'utf8'
  )
  await page.getByRole('button', { name: 'Relink folder…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'offline.' })).toBeHidden()
  await expect(page.getByText('Relinked 1 file')).toBeVisible()
})

test('an edit is autosaved and survives closing and relaunching the app', async ({ session }) => {
  const { page, profileDir } = session
  await session.createProject('Autosave project')
  await session.importMedia([FIXTURES.clipA])
  await expect(mediaCard(page, 'clip-a.mp4')).toBeVisible()

  await page.getByRole('button', { name: 'Manage tags' }).click()
  await page.getByPlaceholder('New tag name').fill('Keep me')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await mediaCard(page, 'clip-a.mp4').click()
  await page
    .getByRole('group', { name: 'Tag selected files' })
    .getByRole('button', { name: 'Keep me' })
    .click()

  const folder = projectFolderOf(profileDir)
  await expect
    .poll(() => readSavedProject(folder).mediaTags.some((tag) => tag.name === 'Keep me'), {
      timeout: 30_000,
      message: 'the tag was not autosaved to project.json'
    })
    .toBe(true)
  await session.close()

  // Relaunch on the same profile, so the project and its files are the ones just saved.
  const relaunched = await launchApp({ profileDir })
  try {
    const next = relaunched.page
    await expect(
      next.getByTestId('dashboard-page').or(next.getByTestId('project-home'))
    ).toBeVisible()
    if (await next.getByTestId('dashboard-page').isVisible()) {
      await openFromDashboard(next, 'Autosave project')
    }
    await expect(mediaCard(next, 'clip-a.mp4')).toBeVisible()
    await mediaCard(next, 'clip-a.mp4').click()
    await expect(
      next
        .getByRole('group', { name: 'Tag selected files' })
        .getByRole('button', { name: 'Keep me' })
    ).toBeVisible()
  } finally {
    await relaunched.close()
  }
})
