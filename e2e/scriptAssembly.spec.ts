// Tutorial sections 11 and 12 (docs/TUTORIAL.md): draft scripts with the fake AI provider, edit and rewrite
// a line, assemble a script onto a short (review, apply in one undo step, swap a take, lock a clip),
// re-assemble one line in place, and batch two scripts into two draft shorts. The fake provider answers
// each request by its prompt (src/main/e2e/fakes.ts). The timeline is read from the clips it draws.
import { expect, type Locator, type Page } from '@playwright/test'
import { FAKE_REWRITE, FAKE_SCRIPT_LINES } from '../src/main/e2e/fakes'
import type { AppSession } from './launchApp'
import { FIXTURES } from './generateFixtures'
import { test } from './test'

const READY_TIMEOUT = 120_000

// A media card in the grid, named by its file name.
function mediaCard(page: Page, fileName: string): Locator {
  const escaped = fileName.replace(/[.]/g, '\\.')
  return page.getByRole('button', { name: new RegExp(`^${escaped}`) })
}

// The AI calls need a saved key. The fake provider never sends it anywhere, so a test value is enough.
async function saveTestKey(page: Page): Promise<void> {
  const result = await page.evaluate(() =>
    window.api.invoke('ai:key:save', { apiKey: 'e2e-test-key' })
  )
  expect(result.ok).toBe(true)
}

// Two clips, both tagged "Harbour". Every script line says "harbour", so each line has two candidates.
async function setUpHarbourProject(session: AppSession): Promise<void> {
  const { page } = session
  await session.createProject('Scripts project')
  await saveTestKey(page)
  await session.importMedia([FIXTURES.clipA, FIXTURES.clipB])
  await expect(mediaCard(page, 'clip-a.mp4')).toBeVisible()
  await expect(mediaCard(page, 'clip-b.mp4')).toBeVisible()

  await page.getByRole('button', { name: 'Manage tags' }).click()
  await page.getByPlaceholder('New tag name').fill('Harbour')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  for (const fileName of ['clip-a.mp4', 'clip-b.mp4']) {
    await mediaCard(page, fileName).click()
    await page
      .getByRole('group', { name: 'Tag selected files' })
      .getByRole('button', { name: 'Harbour' })
      .click()
  }
}

// Drafts scripts through the Batch dialog: the brief, the cost check, then the run.
async function draftScripts(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: /^Batch/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Draft scripts with AI' })
  await dialog.getByLabel('Topic').fill('Harbour mornings')
  await dialog.getByLabel('Scripts', { exact: true }).fill(String(count))
  await dialog.getByRole('button', { name: 'Review cost' }).click()
  await expect(dialog.getByText(/Estimated cost/)).toBeVisible()
  await dialog
    .getByRole('button', { name: count === 1 ? 'Draft 1 script' : `Draft ${count} scripts` })
    .click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: /^Harbour draft/ })).toHaveCount(count, {
    timeout: READY_TIMEOUT
  })
}

// Opens a script row on Project home. Returns the script editor dialog.
async function openScript(page: Page, title: string): Promise<Locator> {
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).click()
  const editor = page.getByRole('dialog', { name: title, exact: true })
  await expect(editor).toBeVisible()
  return editor
}

// The clips on the open short's timeline, in order, with their labels and positions.
async function readClips(page: Page): Promise<{ label: string; left: string }[]> {
  return page.getByTestId('timeline-clip').evaluateAll((elements) =>
    elements.map((element) => ({
      label: element.getAttribute('aria-label') ?? '',
      left: (element as HTMLElement).style.left
    }))
  )
}

// Creates a short from the script, matches footage, and applies the plan. Returns the short's name.
async function assembleScriptOnNewShort(session: AppSession, title: string): Promise<string> {
  const { page } = session
  const editor = await openScript(page, title)
  await editor.getByRole('button', { name: 'New short from script', exact: true }).click()
  const attached = editor.getByRole('region', { name: 'Shorts from this script' }).locator('li')
  await expect(attached).toHaveCount(1)
  const shortName = (await attached.first().locator('span').first().innerText()).trim()

  await editor.getByRole('button', { name: 'Match footage', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review footage' })
  await review.getByRole('button', { name: 'Match footage', exact: true }).click()
  for (const line of FAKE_SCRIPT_LINES) {
    await expect(review.getByText(line, { exact: true })).toBeVisible({ timeout: READY_TIMEOUT })
  }
  await expect(review.getByText(/clip-[ab]\.mp4 · 0\.0s to 4\.0s/)).toHaveCount(
    FAKE_SCRIPT_LINES.length
  )
  await review.getByRole('button', { name: 'Apply footage', exact: true }).click()
  await expect(review).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  return shortName
}

test('drafts scripts with the fake provider, then edits and rewrites a line', async ({
  session
}) => {
  const { page } = session
  await setUpHarbourProject(session)
  await draftScripts(page, 2)

  const editor = await openScript(page, 'Harbour draft 1')
  const lineTwo = editor.getByLabel('Line 2', { exact: true })
  await lineTwo.fill('Boats leave the harbour at first light.')
  await expect(lineTwo).toHaveValue('Boats leave the harbour at first light.')

  await editor.getByRole('button', { name: 'AI actions for line 1' }).click()
  await page.getByRole('menuitem', { name: 'Shorter' }).click()
  const suggestion = editor.getByLabel('Suggestion for line 1')
  await expect(suggestion).toContainText(FAKE_REWRITE, { timeout: READY_TIMEOUT })
  await suggestion.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(editor.getByLabel('Line 1', { exact: true })).toHaveValue(FAKE_REWRITE)
})

test('assembles a script: the review shows the plan, Apply is one undo step, a take is swapped and a clip locked', async ({
  session
}) => {
  const { page } = session
  await setUpHarbourProject(session)
  await draftScripts(page, 1)
  const shortName = await assembleScriptOnNewShort(session, 'Harbour draft 1')

  await session.openShort(shortName)
  const clips = page.getByTestId('timeline-clip')
  await expect(clips).toHaveCount(FAKE_SCRIPT_LINES.length)

  // One undo removes every applied clip, and one redo brings them all back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(clips).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(clips).toHaveCount(FAKE_SCRIPT_LINES.length)

  // Swap the third clip to its alternative take.
  const third = clips.nth(2)
  await third.click()
  await expect(page.getByText(/^Take 1: clip-[ab]\.mp4/)).toBeVisible()
  const before = await third.getAttribute('aria-label')
  await page.getByRole('button', { name: 'Swap', exact: true }).click()
  await expect(third).not.toHaveAttribute('aria-label', before ?? '')

  // Lock the first clip.
  await clips.nth(0).click()
  await page.getByRole('button', { name: 'Lock clip', exact: true }).click()
  await expect(clips.nth(0)).toHaveAttribute('aria-label', /clip locked/)
})

test('re-assembles one line: only its unlocked clip changes, and it stays in place', async ({
  session
}) => {
  const { page } = session
  await setUpHarbourProject(session)
  await draftScripts(page, 1)
  const shortName = await assembleScriptOnNewShort(session, 'Harbour draft 1')

  await session.openShort(shortName)
  const clips = page.getByTestId('timeline-clip')
  await expect(clips).toHaveCount(FAKE_SCRIPT_LINES.length)
  await clips.nth(0).click()
  await page.getByRole('button', { name: 'Lock clip', exact: true }).click()
  await expect(clips.nth(0)).toHaveAttribute('aria-label', /clip locked/)
  const before = await readClips(page)

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByTestId('project-home')).toBeVisible()
  const editor = await openScript(page, 'Harbour draft 1')
  await editor.getByRole('button', { name: 'Re-assemble line 2', exact: true }).click()
  await expect(editor.getByRole('group', { name: 'Next steps for line 2' })).toBeVisible({
    timeout: READY_TIMEOUT
  })
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  await session.openShort(shortName)
  await expect(clips).toHaveCount(FAKE_SCRIPT_LINES.length)
  const after = await readClips(page)
  // The locked first clip and the untouched third clip keep their label and place.
  expect(after[0]).toEqual(before[0])
  expect(after[2]).toEqual(before[2])
  // The second line's clip changed, and sits where it was, not at the end of the timeline.
  expect(after[1].label).not.toEqual(before[1].label)
  expect(after[1].left).toEqual(before[1].left)
})

test('batches two scripts through approve, assemble and review into two draft shorts', async ({
  session
}) => {
  const { page } = session
  await setUpHarbourProject(session)
  await draftScripts(page, 2)

  for (const title of ['Harbour draft 1', 'Harbour draft 2']) {
    const editor = await openScript(page, title)
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(editor.getByRole('button', { name: 'Unapprove', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
  }

  await page.getByRole('button', { name: /^Batch/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Draft scripts with AI' })
  await dialog.getByRole('button', { name: 'Assemble approved', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Footage ready to review')).toHaveCount(2, {
    timeout: READY_TIMEOUT
  })

  for (const title of ['Harbour draft 1', 'Harbour draft 2']) {
    const editor = await openScript(page, title)
    await editor.getByRole('button', { name: 'Match footage', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Review footage' })
    const apply = review.getByRole('button', { name: 'Apply footage', exact: true })
    await expect(apply).toBeEnabled({ timeout: READY_TIMEOUT })
    await apply.click()
    await expect(review).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
  }

  await expect(page.getByText('Batch draft', { exact: true })).toHaveCount(2)
})
