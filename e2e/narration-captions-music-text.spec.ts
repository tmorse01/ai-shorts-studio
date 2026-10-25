// Spec 18.06: narration, captions, music and text. A short with a script and one footage clip is opened.
// A WAV is dropped on the Narration lane, one script line is made with text to speech (fake voice), the
// narration is captioned (fake transcript), music is dropped on the Music lane and looped with ducking on,
// and a title card is added. Then the preview is played and its audio graph must not be silent.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createProfileDir, launchApp, type AppSession } from './launchApp'
import { FIXTURES } from './generateFixtures'
import type { E2eHook } from '../src/shared/e2e/previewHook'
import { CURRENT_SCHEMA_VERSION } from '../src/shared/project/schema'
import { IDENTITY_TRANSFORM } from '../src/shared/timeline/timeline'

const PROJECT_NAME = 'Narration project'
const SHORT_NAME = 'Narration short'
const SHORT_SECONDS = 10
const SPEECH_VOICE = 'e2e-voice'
const CAPTION_EDIT = 'Edited caption'

/** Writes a project with one footage clip, a script of two lines, and the default voice for speech. */
async function seedProject(profileDir: string): Promise<void> {
  const folder = join(profileDir, 'Projects', PROJECT_NAME)
  await mkdir(join(folder, 'cache'), { recursive: true })
  await mkdir(join(folder, 'speech'), { recursive: true })
  const now = new Date().toISOString()
  const short = {
    id: 'short-1',
    name: SHORT_NAME,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    order: 0,
    targetLength: { minSec: 5, maxSec: 30 },
    platform: 'generic',
    overrides: {},
    editedSinceExport: false,
    scriptId: 'script-1',
    timeline: {
      tracks: [
        {
          id: 'track-main',
          kind: 'video',
          role: 'main',
          muted: false,
          clips: [
            {
              id: 'clip-1',
              mediaId: 'media-a',
              startMs: 0,
              durationMs: SHORT_SECONDS * 1000,
              sourceInMs: 0,
              transform: IDENTITY_TRANSFORM
            }
          ]
        }
      ],
      transitions: []
    }
  }
  const project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    name: PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    media: [
      {
        id: 'media-a',
        path: FIXTURES.clipA,
        pathKind: 'absolute',
        fileName: 'clip-a.mp4',
        sizeBytes: 1,
        durationMs: 30_000,
        kind: 'video'
      }
    ],
    mediaTags: [],
    moments: [],
    defaults: { targetLength: { minSec: 30, maxSec: 60 }, platform: 'generic', safeZones: true },
    shorts: [short],
    scripts: [
      {
        id: 'script-1',
        title: 'Script',
        topic: 'E2E',
        lines: [
          { id: 'line-1', text: 'Welcome to the short.' },
          { id: 'line-2', text: 'Here is the second line.' }
        ]
      }
    ]
  }
  await writeFile(join(folder, 'project.json'), JSON.stringify(project, null, 2), 'utf8')
  await writeFile(
    join(folder, 'speech', 'speech.json'),
    JSON.stringify({ defaultVoiceId: SPEECH_VOICE }),
    'utf8'
  )
  const recent = [{ folderPath: folder, name: PROJECT_NAME, lastOpened: now, shortCount: 1 }]
  await writeFile(join(profileDir, 'recent-projects.json'), JSON.stringify(recent), 'utf8')
}

/** The E2E hook the preview and the audio graph publish, or undefined outside E2E mode. */
async function readHook(session: AppSession): Promise<E2eHook | undefined> {
  return session.page.evaluate(
    () => (window as unknown as { __aissE2E?: E2eHook }).__aissE2E ?? undefined
  )
}

/** A button on the editor's tool rail, by its label. */
function toolButton(session: AppSession, name: string) {
  return session.page
    .getByRole('navigation', { name: 'Editor tools' })
    .getByRole('button', { name, exact: true })
}

// Playwright needs a destructuring first argument, even when no fixture is used.
// eslint-disable-next-line no-empty-pattern
test('narration, captions, music and text render, and the preview plays with sound', async ({}, testInfo) => {
  const profileDir = await createProfileDir()
  await seedProject(profileDir)
  const session = await launchApp({ profileDir })
  const { page } = session
  // The trace is kept only when the test fails, as the shared fixture in ./test.ts does.
  const tracing = session.app.context().tracing
  await tracing.start({ screenshots: true, snapshots: true })
  let failed = false
  try {
    // Step 1: import the WAV and the music, then drop the WAV on the Narration lane.
    await page.getByText(PROJECT_NAME, { exact: true }).first().click()
    await expect(page.getByTestId('project-home')).toBeVisible()
    await session.importMedia([FIXTURES.narrationWav, FIXTURES.musicShort])
    await session.openShort(SHORT_NAME)
    await expect(page.getByRole('navigation', { name: 'Editor tools' })).toBeVisible()

    // The Media panel is closed on a fresh editor, so the tool opens it before the drag.
    await toolButton(session, 'Media').click()
    await page.getByTestId('lane-add-narration').click()
    const narrationLane = page.locator('[data-role="narration"]')
    await page
      .getByTitle('Drag onto the timeline')
      .filter({ hasText: 'narration.wav' })
      .dragTo(narrationLane, { targetPosition: { x: 5, y: 15 } })
    const narrationClips = narrationLane.locator('[role="button"]')
    await expect(narrationClips).toHaveCount(1)

    // Step 1 (cont.): text to speech with the fake voice places a second narration clip.
    await toolButton(session, 'Audio').click()
    await page.getByRole('button', { name: 'Generate', exact: true }).first().click()
    await expect(narrationClips).toHaveCount(2, { timeout: 30_000 })

    // Step 2: caption the narration, then edit one caption's text.
    await toolButton(session, 'Captions').click()
    await page.getByRole('button', { name: 'Caption narration' }).click()
    const blocks = page.locator('[data-block-id]')
    await expect(blocks.first()).toBeVisible({ timeout: 30_000 })
    await blocks.first().dblclick()
    await page.getByLabel('Caption text').fill(CAPTION_EDIT)
    await page.getByLabel('Caption text').press('Enter')
    await expect(blocks.filter({ hasText: CAPTION_EDIT })).toHaveCount(1)
    // The caption is drawn on the preview at the playhead, which starts at 0.
    await expect
      .poll(async () =>
        ((await readHook(session))?.texts ?? []).some((line) => line.includes(CAPTION_EDIT))
      )
      .toBe(true)

    // Step 3: drop music, loop it to fill the short, and turn ducking on.
    await toolButton(session, 'Media').click()
    await page.getByTestId('lane-add-music').click()
    await page
      .getByTitle('Drag onto the timeline')
      .filter({ hasText: 'music-short.m4a' })
      .dragTo(page.locator('[data-role="music"]'), { targetPosition: { x: 5, y: 15 } })
    const musicClips = page.locator('[data-role="music"] [role="button"]')
    await expect(musicClips).toHaveCount(1)
    await musicClips.first().click()
    await page.getByTestId('timeline-loop-fill').click()
    await expect.poll(() => musicClips.count()).toBeGreaterThan(1)
    await page.getByRole('tab', { name: 'Audio', exact: true }).click()
    await page.getByRole('switch', { name: 'Duck under narration' }).click()
    await expect(page.getByTestId('timeline-gain-line').first()).toBeVisible()

    // Step 4: add a title card. Its text shows on the preview at the playhead, and it fades in.
    await toolButton(session, 'Text').click()
    await page.getByRole('button', { name: 'Add text' }).click()
    await page.getByRole('menuitem', { name: 'Title card' }).click()
    await expect
      .poll(async () =>
        ((await readHook(session))?.texts ?? []).some((line) => line.includes('Your title'))
      )
      .toBe(true)
    await page.getByRole('tab', { name: 'Video', exact: true }).click()
    await expect(page.getByLabel('Text entry motion')).toContainText(/fade/i)

    // Step 5: play the preview. The audio graph must carry sound while it plays.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect
      .poll(async () => (await readHook(session))?.audioLevel ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
  } catch (error) {
    failed = true
    await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {})
    throw error
  } finally {
    if (failed) {
      await tracing.stop({ path: testInfo.outputPath('trace.zip') }).catch(() => {})
    } else {
      await tracing.stop().catch(() => {})
    }
    await session.close()
    await rm(profileDir, { recursive: true, force: true })
  }
})
