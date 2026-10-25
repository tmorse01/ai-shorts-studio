// Tutorial section 3: analyse footage, read the transcript, and work through Clip Finder. The fakes give a
// fixed transcript ("Welcome to the lantern market. Today we follow the river bridges.") and two fixed
// moment suggestions, so every step can be checked against known text.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppSession } from './launchApp'
import { FIXTURES } from './generateFixtures'
import { expect, test } from './test'

const DRAFT_A = 'Lantern market welcome'
const DRAFT_B = 'River bridges'

// Attaches every analysis.json the app wrote under the test profile, so a failed wait shows each stage's state.
async function attachAnalysisFiles(profileDir: string): Promise<void> {
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) found.push(...(await walk(path)))
      else if (entry.name === 'analysis.json') found.push(path)
    }
    return found
  }
  for (const file of await walk(profileDir)) {
    const body = await readFile(file, 'utf8').catch(() => '(unreadable)')
    await test.info().attach(`analysis.json ${file.slice(profileDir.length)}`, {
      body,
      contentType: 'application/json'
    })
  }
}

// Waits for the clip's status to read Analyzed. On a timeout, the analysis files are attached first.
async function expectAnalyzed(session: AppSession): Promise<void> {
  try {
    await expect(session.page.getByText('Analyzed', { exact: true }).first()).toBeVisible({
      timeout: 180_000
    })
  } catch (error) {
    await attachAnalysisFiles(session.profileDir)
    throw error
  }
}

// Imports clip A, selects it, and runs analysis. A plain click on the clip also opens it in Source view.
async function analyseClip(session: AppSession): Promise<void> {
  const { page } = session
  await session.importMedia([FIXTURES.clipA])
  await page.getByRole('button', { name: /^clip-a\.mp4/ }).click()
  await page.getByRole('button', { name: 'Analyse selected' }).click()
  await expectAnalyzed(session)
}

// The Clip Finder row whose title matches, so a test acts on one candidate.
function candidate(session: AppSession, title: string) {
  return session.page
    .getByRole('list', { name: 'Clip candidates' })
    .getByRole('listitem')
    .filter({ hasText: title })
}

test('analyses a clip: the stages complete and the status shows in the media panel', async ({
  session
}) => {
  const { page } = session
  await session.createProject('Analysis project')
  await session.importMedia([FIXTURES.clipA])

  await page.getByRole('button', { name: /^clip-a\.mp4/ }).click()
  await page.getByRole('button', { name: 'Analyse selected' }).click()

  // The status moves from waiting or analyzing to analyzed. It must not end in a failure.
  await expect(page.getByText('Analysis failed')).toHaveCount(0)
  await expectAnalyzed(session)
})

test('the Transcript tab lists the fake lines, and clicking a word seeks the source', async ({
  session
}) => {
  const { page } = session
  await session.createProject('Transcript project')
  await analyseClip(session)

  await page.getByRole('tab', { name: 'Transcript' }).click()
  const words = page.getByRole('region', { name: 'Transcript words' })
  await expect(words).toContainText('lantern')
  await expect(words).not.toContainText('No speech')

  await words.getByText('follow', { exact: true }).click()
  // The clicked word becomes the active word, so the playhead moved to its start.
  await expect(words.locator('[data-word-index="7"]')).toHaveClass(/current/)
})

test('Clip Finder: AI drafts show the label, accept makes a moment, dismiss removes, star and Starred filter work', async ({
  session
}) => {
  const { page } = session
  await session.createProject('Clip Finder project')
  await analyseClip(session)

  await page.getByRole('button', { name: 'Clip Finder' }).click()
  await page.getByRole('button', { name: 'Find moments' }).click()
  await expect(candidate(session, DRAFT_A)).toBeVisible({ timeout: 180_000 })
  await expect(candidate(session, DRAFT_A).getByText('AI suggested')).toBeVisible()
  await expect(candidate(session, DRAFT_B).getByText('AI suggested')).toBeVisible()

  // Dismiss removes the draft from the list.
  await candidate(session, DRAFT_A).getByRole('button', { name: 'Dismiss' }).click()
  await expect(candidate(session, DRAFT_A)).toHaveCount(0)

  // Accept turns the draft into a moment: it no longer offers Accept, and it stays in the list.
  await candidate(session, DRAFT_B).getByRole('button', { name: 'Accept' }).click()
  await expect(candidate(session, DRAFT_B)).toBeVisible()
  await expect(candidate(session, DRAFT_B).getByRole('button', { name: 'Accept' })).toHaveCount(0)

  // Star the moment, then the Starred filter shows only starred clips.
  await candidate(session, DRAFT_B).getByRole('button', { name: 'Star clip' }).click()
  await page
    .getByRole('group', { name: 'Filter clip candidates' })
    .getByRole('button', { name: 'Starred' })
    .click()
  await expect(candidate(session, DRAFT_B)).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Clip candidates' }).getByRole('listitem')
  ).toHaveCount(1)
})

test('search finds a moment by a transcript word', async ({ session }) => {
  const { page } = session
  await session.createProject('Search project')
  await analyseClip(session)

  await page.getByRole('button', { name: 'Clip Finder' }).click()
  await page.getByRole('button', { name: 'Find moments' }).click()
  await candidate(session, DRAFT_B).getByRole('button', { name: 'Accept' }).click()

  // "follow" is spoken inside the moment and is not in its name or note, so only the transcript finds it.
  await page.getByRole('combobox', { name: 'Search footage' }).fill('follow')
  await expect(page.getByRole('region', { name: 'Search results' })).toContainText(DRAFT_B)
})

test.describe('without the AI fake', () => {
  test.use({ aiFakes: false })

  test('a missing API key shows a plain-language message, not a crash', async ({ session }) => {
    const { page } = session
    await session.createProject('No key project')
    await analyseClip(session)

    await page.getByRole('button', { name: 'Clip Finder' }).click()
    await page.getByRole('button', { name: 'Find moments' }).click()
    await expect(page.getByText('Add an Anthropic API key in Settings first.')).toBeVisible()
    // The window is still usable after the error.
    await expect(page.getByTestId('project-home')).toBeVisible()
  })
})
