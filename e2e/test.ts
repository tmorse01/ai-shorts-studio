// The test fixture every spec imports. It launches a fresh app per test and keeps the trace and a
// screenshot only when the test fails. Passing tests leave nothing behind. Electron does not record
// video reliably in Playwright, so video is not kept.
import { rm } from 'node:fs/promises'
import { test as base } from '@playwright/test'
import { createProfileDir, launchApp, type AppSession } from './launchApp'

export const test = base.extend<{ session: AppSession; aiFakes: boolean }>({
  // Set per file or test with test.use({ aiFakes: false }) to run Claude without the fake.
  aiFakes: [true, { option: true }],
  session: async ({ aiFakes }, use, testInfo) => {
    const profileDir = await createProfileDir()
    const session = await launchApp({ profileDir, aiFakes })
    const tracing = session.app.context().tracing
    await tracing.start({ screenshots: true, snapshots: true })

    await use(session)

    const failed = testInfo.status !== testInfo.expectedStatus
    if (failed) {
      await session.page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {})
      await tracing.stop({ path: testInfo.outputPath('trace.zip') }).catch(() => {})
    } else {
      await tracing.stop().catch(() => {})
    }
    await session.close().catch(() => {})
    await rm(profileDir, { recursive: true, force: true })
  }
})

export { expect } from '@playwright/test'
