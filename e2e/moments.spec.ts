// Epic 18, spec #272: a moment marked in the source viewer reaches the timeline. Covers In/Out marks,
// saving a moment, adding it from the Clip Finder, dragging the moment and the marked range, the clip
// label, renaming, and the two ways to start a short from Project home.
import { expect, test } from './test'
import { FIXTURES } from './generateFixtures'

const MOMENT = 'Jump'

test('marks a moment and adds it to the timeline', async ({ session }) => {
  const { page } = session

  await test.step('create a project and import the clip', async () => {
    await session.createProject('Moments project')
    await session.importMedia([FIXTURES.clipA])
    await expect(page.getByText('clip-a.mp4').first()).toBeVisible()
  })

  await test.step('open a short and the clip in the source viewer', async () => {
    await page.getByRole('button', { name: 'New short' }).first().click()
    await expect(page.getByLabel('Playhead')).toBeVisible()
    await page.getByText('clip-a.mp4').first().click()
    await expect(page.getByLabel('Source: clip-a.mp4')).toBeVisible()
  })

  await test.step('mark In=5s and Out=8s and save the moment', async () => {
    await page.getByLabel('Playhead').fill('5000')
    await page.keyboard.press('i')
    await page.getByLabel('Playhead').fill('8000')
    await page.keyboard.press('o')
    await page.keyboard.press('m')
    await page.getByLabel('Moment name').fill(MOMENT)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('list', { name: 'Moments' })).toContainText(MOMENT)
  })

  await test.step('add the moment through the Clip Finder button', async () => {
    await page
      .getByRole('listitem')
      .filter({ hasText: MOMENT })
      .getByRole('button', { name: 'Add to timeline' })
      .first()
      .click()
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(1)
  })

  await test.step('drag the moment onto the timeline', async () => {
    const momentRow = page.getByRole('list', { name: 'Moments' }).getByRole('listitem').first()
    await momentRow.dragTo(page.locator('[data-track-id]').first(), {
      targetPosition: { x: 600, y: 20 }
    })
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(2)
  })

  await test.step('drag the marked range onto the timeline', async () => {
    await page.getByLabel('Playhead').fill('5000')
    await page.keyboard.press('i')
    await page.getByLabel('Playhead').fill('8000')
    await page.keyboard.press('o')
    await page
      .getByRole('button', { name: 'Drag the marked range to the timeline' })
      .dragTo(page.locator('[data-track-id]').first(), { targetPosition: { x: 900, y: 20 } })
    await expect(page.locator(`[aria-label^="${MOMENT}"]`)).toHaveCount(3)
  })

  await test.step('TODO(source-time hook): preview at clip start shows 00:05', async () => {
    // Pending: needs the source-time test hook from another worker. Not on origin/rebuild yet.
    // Once it lands, read the preview's source time at the first clip's start and expect 00:05.
  })

  await test.step('the timeline label follows a renamed moment', async () => {
    await page.getByRole('list', { name: 'Moments' }).getByRole('listitem').first()
      .getByRole('button', { name: 'Rename moment' }).click()
    await page.getByRole('list', { name: 'Moments' }).getByLabel('Moment name').fill('Jump renamed')
    await page.keyboard.press('Enter')
    await expect(page.locator('[aria-label^="Jump renamed"]').first()).toBeVisible()
  })
})

test('New short from Project home opens a short', async ({ session }) => {
  const { page } = session
  await session.createProject('Short project')
  await page.getByRole('button', { name: 'New short' }).first().click()
  await expect(page).toHaveURL(/\/short\//)
  await expect(page.getByLabel('Playhead')).toBeVisible()
})
