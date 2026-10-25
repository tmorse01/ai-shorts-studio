// Epic 18, spec #272: a moment marked in the source viewer reaches the timeline. Covers In/Out marks,
// saving a moment, adding it from the Clip Finder, dragging the moment and the marked range, the clip
// label, renaming, and the ways to start a short from Project home.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { FIXTURES } from './generateFixtures'

const MOMENT = 'Jump'

// The enabled New short button. The guided start has a New short button too, disabled until the
// footage is analysed, so the enabled one is the shorts grid's.
function newShortButton(page: import('@playwright/test').Page) {
  return page.locator('button:not([disabled])', { hasText: 'New short' }).first()
}

// Every object in the saved project that carries a clip's source fields.
function collectClips(
  node: unknown,
  out: Record<string, unknown>[] = []
): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((item) => collectClips(item, out))
  else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if ('sourceInMs' in record) out.push(record)
    Object.values(record).forEach((value) => collectClips(value, out))
  }
  return out
}

// Moves the playhead by setting the range input and firing the input event React listens to. A plain
// fill is refused when the slider is not reported visible.
async function seekTo(page: Page, ms: number): Promise<void> {
  await page.getByLabel('Playhead').evaluate((element, value) => {
    const input = element as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, ms)
}

// The moments of a clip are folded behind a "N moment" toggle in the Media panel. Opens it when closed.
// The panel remounts when another left tool is shown, so this runs again after switching back.
async function openMomentList(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: '1 moment' })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
}

async function findProjectFiles(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await findProjectFiles(path)))
    else if (entry.name === 'project.json') found.push(path)
  }
  return found
}

test('marks a moment and adds it to the timeline', async ({ session }) => {
  const { page } = session

  await test.step('create a project and import the clip', async () => {
    await session.createProject('Moments project')
    await session.importMedia([FIXTURES.clipA])
    await expect(page.getByText('clip-a.mp4').first()).toBeVisible()
  })

  await test.step('open a short and the clip in the source viewer', async () => {
    await newShortButton(page).click()
    await expect(page.getByLabel('Playhead')).toBeVisible()
    // The editor opens with the Media panel folded away. Show it, then click the clip.
    const showMedia = page.getByRole('button', { name: 'Show media panel' })
    if (await showMedia.isVisible()) await showMedia.click()
    await page.getByText('clip-a.mp4').first().click()
    await expect(page.getByLabel('Source: clip-a.mp4')).toBeVisible()
  })

  await test.step('mark In=5s and Out=8s and save the moment', async () => {
    await seekTo(page, 5000)
    await page.keyboard.press('i')
    await seekTo(page, 8000)
    await page.keyboard.press('o')
    await page.keyboard.press('m')
    await page.getByLabel('Moment name').fill(MOMENT)
    await page.keyboard.press('Enter')
    await openMomentList(page)
    await expect(page.getByRole('list', { name: 'Moments' })).toContainText(MOMENT)
  })

  await test.step('add the moment through the Clip Finder button', async () => {
    await page.getByRole('button', { name: 'Clip Finder', exact: true }).click()
    await page
      .getByRole('listitem')
      .filter({ hasText: MOMENT })
      .getByRole('button', { name: 'Add to timeline' })
      .first()
      .click()
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(1)
  })

  await test.step('drag the moment onto the timeline', async () => {
    await page.getByRole('button', { name: 'Media', exact: true }).click()
    await openMomentList(page)
    const momentRow = page.getByRole('list', { name: 'Moments' }).getByRole('listitem').first()
    await momentRow.dragTo(page.locator('[data-track-id]').first(), {
      targetPosition: { x: 600, y: 20 }
    })
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(2)
  })

  await test.step('drag the marked range onto the timeline', async () => {
    await seekTo(page, 5000)
    await page.keyboard.press('i')
    await seekTo(page, 8000)
    await page.keyboard.press('o')
    // Drop at the far end of the main lane, past the clips already there, so the range does not overlap.
    const lane = page.locator('[data-track-id]').first()
    const width = (await lane.boundingBox())?.width ?? 0
    await page
      .getByRole('button', { name: 'Drag the marked range to the timeline' })
      .dragTo(lane, { targetPosition: { x: Math.max(0, width - 20), y: 20 } })
    // The timeline renders only the clips in view, and the drop scrolled it to the end. Fit it again.
    await page.getByRole('button', { name: 'Fit timeline' }).click()
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(2)
    // A marked range is plain footage, not the moment, so its clip takes the file name.
    await expect(page.locator('[aria-label^="clip-a.mp4"]')).toHaveCount(1)
  })

  await test.step('each clip has sourceInMs 5000 and durationMs 3000', async () => {
    // Saving is asynchronous, so poll the project file until the three clips are on it.
    await expect
      .poll(async () => {
        const files = await findProjectFiles(session.profileDir)
        if (files.length === 0) return []
        const project: unknown = JSON.parse(await readFile(files[0], 'utf8'))
        return collectClips(project).filter((clip) => clip.durationMs === 3000)
      })
      .toHaveLength(3)
    const files = await findProjectFiles(session.profileDir)
    const project: unknown = JSON.parse(await readFile(files[0], 'utf8'))
    for (const clip of collectClips(project).filter((clip) => clip.durationMs === 3000)) {
      expect(clip.sourceInMs).toBe(5000)
    }
  })

  await test.step('TODO(source-time hook): preview at clip start shows 00:05', async () => {
    // Pending: needs the source-time test hook from another worker. Not on origin/rebuild yet.
    // Once it lands, read the preview's source time at the first clip's start and expect 00:05.
  })

  await test.step('the timeline label follows a renamed moment', async () => {
    await page
      .getByRole('list', { name: 'Moments' })
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: 'Rename moment' })
      .click()
    await page.getByRole('list', { name: 'Moments' }).getByLabel('Moment name').fill('Jump renamed')
    await page.keyboard.press('Enter')
    await expect(page.locator('[aria-label^="Jump renamed"]').first()).toBeVisible()
  })
})

test('New short from Project home opens a short', async ({ session }) => {
  const { page } = session
  await session.createProject('Short project')
  await newShortButton(page).click()
  await expect(page).toHaveURL(/\/short\//)
  await expect(page.getByLabel('Playhead')).toBeVisible()
})

test('Clip Finder link with no shorts creates and opens one', async ({ session }) => {
  const { page } = session
  await session.createProject('Finder project')
  await session.importMedia([FIXTURES.clipA])
  await expect(page.getByText('clip-a.mp4').first()).toBeVisible()
  await page.getByRole('button', { name: 'Clip Finder' }).click()
  await expect(page).toHaveURL(/\/short\//)
  await expect(page.getByLabel('Playhead')).toBeVisible()
})
