// Tutorial section 3: analyse footage, read the transcript, and work through Clip Finder. The spec
// follows the tutorial's steps. Tests that need the fakes to return transcript lines or AI suggestions
// are marked fixme: the harness fakes (src/main/e2e/fakes.ts) return an empty transcript and no
// suggestions today, so those steps cannot be observed yet.
import { FIXTURES } from './generateFixtures'
import { expect, test } from './test'

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
  await expect(page.getByText('Analyzed', { exact: true }).first()).toBeVisible({
    timeout: 180_000
  })
})

test.fixme('the Transcript tab lists the fake lines and clicking a line seeks the source', // Blocked: FAKE_TRANSCRIPT in src/main/e2e/fakes.ts has no words, so the tab shows "No speech".
async ({ session }) => {
  await session.createProject('Transcript project')
  await session.importMedia([FIXTURES.clipA])
  await session.page.getByText('clip-a.mp4', { exact: true }).first().click()
  await session.page.getByRole('button', { name: 'Analyse selected' }).click()
  await expect(session.page.getByRole('list', { name: 'Transcript words' })).toBeVisible({
    timeout: 180_000
  })
})

test.fixme('Clip Finder: AI drafts show the label, accept makes a moment, dismiss removes, star and Starred filter work', // Blocked: FAKE_CLAUDE_REPLY in src/main/e2e/fakes.ts is "[]", so no AI drafts are produced.
async ({ session }) => {
  await session.createProject('Clip Finder project')
  await session.importMedia([FIXTURES.clipA])
  await session.page.getByText('clip-a.mp4', { exact: true }).first().click()
  await session.page.getByRole('button', { name: 'Analyse selected' }).click()
  await session.page.getByRole('button', { name: 'Clip Finder' }).click()
  await expect(session.page.getByText('AI suggested').first()).toBeVisible({ timeout: 180_000 })
  await session.page.getByRole('button', { name: 'Accept' }).first().click()
  await session.page.getByRole('button', { name: 'Starred' }).click()
})

test.fixme('search finds a moment by a transcript word', // Blocked: needs the fake transcript words (see above).
async () => {})

test.fixme('a missing API key with the fakes off shows a plain-language toast, not a crash', // Blocked: launchApp always sets AISS_E2E=1, so the fakes cannot be switched off per test.
async () => {})
