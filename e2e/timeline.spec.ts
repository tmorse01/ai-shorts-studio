// Epic 18 #273: the drag-centred editing core, driven through the app. One short is cut, framed and
// layered on the timeline, then every edit is undone and redone and the project is reopened. The
// saved project file is the serialized short: each check reads it back from disk.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { launchApp } from './launchApp'
import { FIXTURES } from './generateFixtures'
import { currentSourceTimecode } from './previewHook'
import { formatTimecode } from '../src/renderer/features/playback/playbackClock'
import type { Clip } from '../src/shared/timeline/timeline'
import { transitionLimitMs } from '../src/shared/timeline/transitions'
import { expect, test } from './test'

// Frame tolerance for a preview check: one frame at 30 fps, plus a little for rounding.
const FRAME_TOLERANCE_MS = 40

interface SavedClip {
  id: string
  mediaId: string
  startMs: number
  durationMs: number
  sourceInMs: number
}
interface SavedTrack {
  id: string
  role: string
  clips: SavedClip[]
}
interface SavedTimeline {
  tracks: SavedTrack[]
  transitions?: { id: string; durationMs: number; fromClipId: string; toClipId: string }[]
}

// The source length of each media item in the saved project, by id.
async function savedMediaDurations(profileDir: string): Promise<Map<string, number>> {
  const file = await findProjectFile(profileDir)
  const project = JSON.parse(await readFile(file ?? '', 'utf8')) as {
    media: { id: string; durationMs?: number }[]
  }
  return new Map(project.media.map((item) => [item.id, item.durationMs ?? 0]))
}

async function findProjectFile(dir: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isFile() && entry.name === 'project.json') return path
    if (entry.isDirectory()) {
      const found = await findProjectFile(path)
      if (found) return found
    }
  }
  return null
}

// The first short's timeline as saved on disk, serialized. Empty while the file is unreadable.
async function savedShort(profileDir: string): Promise<string> {
  try {
    const file = await findProjectFile(profileDir)
    if (!file) return ''
    const project = JSON.parse(await readFile(file, 'utf8')) as {
      shorts: { timeline: SavedTimeline }[]
    }
    return JSON.stringify(project.shorts[0]?.timeline ?? null)
  } catch {
    return ''
  }
}

function parseSaved(serialized: string): SavedTimeline {
  return JSON.parse(serialized) as SavedTimeline
}

function mainClips(serialized: string): SavedClip[] {
  const main = parseSaved(serialized).tracks.find((track) => track.role === 'main')
  return [...(main?.clips ?? [])].sort((a, b) => a.startMs - b.startMs)
}

async function box(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  const result = await locator.boundingBox()
  if (!result) throw new Error('Element has no box')
  return result
}

function center(b: { x: number; y: number; width: number; height: number }) {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

// A press point on a trim handle, near its bottom. The clip's Clip menu covers the top left corner.
async function handlePoint(handle: Locator): Promise<{ x: number; y: number }> {
  const b = await box(handle)
  return { x: b.x + b.width / 2, y: b.y + b.height - 4 }
}

// Press at one point, move in steps, and release. Used for every drag in the editor.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

test('edits a short on the timeline, undoes and redoes every step, and survives a relaunch', async ({
  session
}) => {
  const page = session.page
  await session.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1600, 1000)
  )
  await session.createProject('Timeline project')
  await session.importMedia([FIXTURES.clipA, FIXTURES.clipB])
  await page
    .locator('button:not([disabled])', { hasText: /^New short$/ })
    .first()
    .click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  if (await page.getByRole('button', { name: 'Show media panel' }).count()) {
    await page.getByRole('button', { name: 'Show media panel' }).click()
  }

  // Every edit records the saved timeline after it lands. Undo and redo check against these.
  const states: string[] = [await savedShort(session.profileDir)]
  async function recordEdit(): Promise<void> {
    const previous = states[states.length - 1]
    await expect.poll(() => savedShort(session.profileDir)).not.toBe(previous)
    states.push(await savedShort(session.profileDir))
  }
  const latest = (): string => states[states.length - 1]

  const mainLane = (): Locator => page.locator('[data-role="main"]').first()
  const mainClipEls = (): Locator => mainLane().locator('[role="button"][data-kind="video"]')
  // The Nth main clip from the left. The DOM keeps track order, which a reorder changes.
  async function clipByStart(rank: number): Promise<Locator> {
    const els = mainClipEls()
    const xs: number[] = []
    for (let i = 0; i < (await els.count()); i += 1) xs.push((await box(els.nth(i))).x)
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
    return els.nth(order[rank])
  }
  const card = (name: string): Locator =>
    page.locator('[title="Drag onto the timeline"]', { hasText: name })
  const fit = () => page.getByRole('button', { name: 'Fit timeline' }).click()
  const laneLeft = async () => (await box(mainLane())).x

  async function dropOnMain(name: string, x: number): Promise<void> {
    await card(name).dragTo(mainLane(), { targetPosition: { x, y: 20 } })
  }

  // A drop point just inside one edge of a clip. A drop there snaps to that edge.
  async function insideEdgeX(index: number, edge: 'start' | 'end'): Promise<number> {
    const b = await box(await clipByStart(index))
    const x = edge === 'end' ? b.x + b.width - 2 : b.x + 2
    return x - (await laneLeft())
  }

  await test.step('3 clips on Main', async () => {
    await page.locator('div:has(> [data-role="main"]) button', { hasText: 'Add' }).first().click()
    await recordEdit()
    await dropOnMain('clip-a.mp4', 0)
    await recordEdit()
    await fit()
    await dropOnMain('clip-b.mp4', await insideEdgeX(0, 'end'))
    await recordEdit()
    await fit()
    await dropOnMain('clip-a.mp4', await insideEdgeX(1, 'end'))
    await recordEdit()
    expect(mainClips(latest())).toHaveLength(3)
  })

  await test.step('drag to reorder: the last clip moves to the start', async () => {
    await fit()
    const third = mainClips(latest())[2].id
    const b = await box(await clipByStart(2))
    const from = center(b)
    // Move the pointer left by the clip's own offset, so the clip starts at 0.
    const dx = b.x - (await laneLeft())
    await drag(page, from, { x: from.x - dx, y: from.y })
    await recordEdit()
    expect(mainClips(latest())[0]?.id).toBe(third)
  })

  await test.step('trim both edges, and the preview shows the edge frame', async () => {
    await fit()
    // Start edge of the first clip: drag right by about 1 s. The preview shows the new first frame.
    const first = mainClips(latest())[0]
    const pxPerMs = (await box(await clipByStart(0))).width / first.durationMs
    const from = await handlePoint(await (await clipByStart(0)).locator('[data-edge="start"]'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 1000 * pxPerMs, from.y, { steps: 10 })
    await page.waitForTimeout(300)
    const during = await currentSourceTimecode(page)
    await page.mouse.up()
    await recordEdit()
    const trimmed = mainClips(latest())[0]
    expect(trimmed.sourceInMs).toBeGreaterThan(first.sourceInMs)
    expect(during.ms).not.toBeNull()
    expect(Math.abs((during.ms ?? 0) - trimmed.sourceInMs)).toBeLessThanOrEqual(FRAME_TOLERANCE_MS)

    // End edge of the second clip: drag left by about 1 s. The last shown frame moves with it.
    const second = mainClips(latest())[1]
    const pxPerMs2 = (await box(await clipByStart(1))).width / second.durationMs
    const from2 = await handlePoint(await (await clipByStart(1)).locator('[data-edge="end"]'))
    await page.mouse.move(from2.x, from2.y)
    await page.mouse.down()
    await page.mouse.move(from2.x - 1000 * pxPerMs2, from2.y, { steps: 10 })
    await page.waitForTimeout(300)
    const duringEnd = await currentSourceTimecode(page)
    await page.mouse.up()
    await recordEdit()
    const trimmedEnd = mainClips(latest())[1]
    expect(trimmedEnd.durationMs).toBeLessThan(second.durationMs)
    const lastFrame = trimmedEnd.sourceInMs + trimmedEnd.durationMs - 1
    expect(Math.abs((duringEnd.ms ?? 0) - lastFrame)).toBeLessThanOrEqual(FRAME_TOLERANCE_MS)
  })

  await test.step('split with S, delete leaves a gap, close gap', async () => {
    await fit()
    const before = mainClips(latest()).length
    // Put the playhead in the middle of the second clip, then split it with S.
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' })
    const clip = await box(await clipByStart(1))
    const rulerBox = await box(ruler)
    await ruler.click({ position: { x: clip.x - rulerBox.x + clip.width / 2, y: 8 } })
    await page.keyboard.press('s')
    await recordEdit()
    expect(mainClips(latest())).toHaveLength(before + 1)
  })

  await test.step('crossfade at a cut, resized', async () => {
    await fit()
    // A cut has a crossfade only where both clips have handle media. The split cut has it.
    const durations = await savedMediaDurations(session.profileDir)
    const clips = mainClips(latest())
    const index = clips.findIndex(
      (clip, i) =>
        i > 0 &&
        clip.startMs === clips[i - 1].startMs + clips[i - 1].durationMs &&
        transitionLimitMs(
          clips[i - 1] as unknown as Clip,
          clip as unknown as Clip,
          durations.get(clips[i - 1].mediaId)
        ) >= 200
    )
    expect(index).toBeGreaterThan(0)
    await (await clipByStart(index)).click({ position: { x: 30, y: 20 } })
    await page.getByRole('button', { name: 'Clip', exact: true }).click()
    await page.getByRole('menuitem', { name: /crossfade at cut/i }).click()
    await recordEdit()
    const transition = page.locator('[aria-label^="Transition: "]')
    await expect(transition).toHaveCount(1)

    // Select the crossfade and set its length on the Transitions panel.
    await transition.click()
    await page.getByRole('button', { name: 'Transitions' }).click()
    await page.getByLabel('Transition duration').fill('0:00.20')
    await page.getByLabel('Transition duration').press('Enter')
    await recordEdit()
    expect(parseSaved(latest()).transitions?.[0]?.durationMs).toBe(200)
  })

  await test.step('delete leaves a gap, close gap', async () => {
    await fit()
    // Deleting a clip with clips on both sides leaves a gap where it was. Prefer a clip that is not
    // on the crossfade's cut, so the crossfade stays put.
    const clips = mainClips(latest())
    const transition = parseSaved(latest()).transitions?.[0]
    const onCut = (id: string) => transition?.fromClipId === id || transition?.toClipId === id
    const middle = clips.map((_, i) => i).filter((i) => i > 0 && i < clips.length - 1)
    const target = middle.find((i) => !onCut(clips[i].id)) ?? middle[0]
    expect(target).toBeDefined()
    const gaps = page.locator('[aria-label^="Gap of"]')
    const gapsBefore = await gaps.count()
    const doomed = clips[target]
    const piece = await box(await clipByStart(target))
    await (await clipByStart(target)).click({ position: { x: piece.width - 30, y: 20 } })
    await page.keyboard.press('Delete')
    await recordEdit()
    expect(mainClips(latest())).toHaveLength(clips.length - 1)
    await expect(gaps).toHaveCount(gapsBefore + 1)
    const gap = page.locator(`[aria-label$="at ${formatTimecode(doomed.startMs)}"]`)
    await expect(gap).toHaveCount(1)

    await gap.click()
    await page.getByRole('button', { name: 'Gap', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Close gap' }).click()
    await recordEdit()
    await expect(gaps).toHaveCount(gapsBefore)
  })

  await test.step('overlay track with a B-roll clip', async () => {
    await page.getByRole('button', { name: 'Add track' }).click()
    await page.getByRole('menuitem', { name: 'Overlay video' }).click()
    await recordEdit()
    const overlay = page.locator('[data-role="overlay"][data-track-id]').first()
    await overlay.scrollIntoViewIfNeeded()
    await card('clip-b.mp4').dragTo(overlay, { targetPosition: { x: 120, y: 20 } })
    await recordEdit()
    const track = parseSaved(latest()).tracks.find((item) => item.role === 'overlay')
    expect(track?.clips).toHaveLength(1)
  })

  await test.step('framing: drag the crop on the canvas, then blur-fit', async () => {
    const preview = page.locator('section[aria-label="Preview"]')
    // Select the clip under the playhead, so the framing section and the canvas gizmo use it.
    await (await clipByStart(0)).click({ position: { x: 30, y: 20 } })
    const shot0 = await preview.screenshot()
    const pb = await box(preview)
    const from = { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }
    await drag(page, from, { x: from.x + 60, y: from.y + 40 })
    await recordEdit()
    const shot1 = await preview.screenshot()
    expect(Buffer.compare(shot0, shot1)).not.toBe(0)

    await page.getByRole('button', { name: 'Blur fit' }).click()
    await recordEdit()
    const shot2 = await preview.screenshot()
    expect(Buffer.compare(shot1, shot2)).not.toBe(0)
  })

  const finalState = latest()

  await test.step('undo and redo every step back to the start and forward again', async () => {
    const undo = page.getByRole('button', { name: 'Undo' })
    const redo = page.getByRole('button', { name: 'Redo' })
    for (let i = states.length - 1; i >= 1; i -= 1) {
      await undo.click()
      await expect.poll(() => savedShort(session.profileDir)).toBe(states[i - 1])
    }
    for (let i = 1; i < states.length; i += 1) {
      await redo.click()
      await expect.poll(() => savedShort(session.profileDir)).toBe(states[i])
    }
    expect(latest()).toBe(finalState)
  })

  await test.step('relaunch: the timeline is identical', async () => {
    await session.close()
    const again = await launchApp({ profileDir: session.profileDir })
    try {
      await again.page.getByText('Timeline project', { exact: true }).first().click()
      await again.openShort('Short 1')
      await expect.poll(() => savedShort(session.profileDir)).toBe(finalState)
    } finally {
      await again.close()
    }
  })
})
