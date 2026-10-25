// Playwright drives the built Electron app (out/). Run `pnpm e2e`, which builds first.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  // Each test launches its own app with a fresh profile, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: [['list']],
  globalSetup: './e2e/globalSetup.ts'
})
