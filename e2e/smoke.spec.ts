import { expect, test } from './test'

test('launches, shows the dashboard, creates a project and opens its home', async ({ session }) => {
  await expect(session.page.getByTestId('dashboard-page')).toBeVisible()
  await session.createProject('Smoke project')
  await expect(session.page.getByTestId('project-home')).toBeVisible()
})
