/* global window, document, Image */
// End-to-end check against the real Electron app, driven over the DevTools protocol.
// It uses a throwaway userData folder, a generated source video, and the real FFmpeg binaries.
// Run with: pnpm e2e   (requires `pnpm build` first and resources/bin populated).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const root = resolve(import.meta.dirname, '..')
const ffmpeg = join(root, 'resources', 'bin', 'ffmpeg.exe')
const ffprobe = join(root, 'resources', 'bin', 'ffprobe.exe')
const electronBin = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const work = mkdtempSync(join(tmpdir(), 'shorts-e2e-'))
const userData = join(work, 'userdata')
const outDir = join(work, 'exports')
const shotPath = join(work, 'screenshot.png')
const port = 9333
mkdirSync(userData, { recursive: true })
mkdirSync(outDir, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Generate a 3-minute source with audio and visible content.
const source = join(work, 'source.mp4')
execFileSync(
  ffmpeg,
  [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=180',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=180',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', source
  ],
  { stdio: 'pipe' }
)
const probeJson = JSON.parse(
  execFileSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', source], { encoding: 'utf8' })
)
const vs = probeJson.streams.find((s) => s.codec_type === 'video')
const project = {
  id: 'e2eproject',
  name: 'E2E project',
  sourcePath: source,
  probe: {
    durationSec: Number(probeJson.format.duration),
    width: vs.width,
    height: vs.height,
    videoCodec: vs.codec_name,
    hasAudio: probeJson.streams.some((s) => s.codec_type === 'audio')
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}
// Seed the state file directly. The native file picker cannot be driven from here, so import is
// represented by the probed record the importer would have written.
writeFileSync(
  join(userData, 'state.json'),
  JSON.stringify({ version: 1, projects: [project], shorts: [], jobs: [], settings: { musicFolder: null } }, null, 2)
)

let electron = null
// E2E_EXE points at an installed/packaged app exe; otherwise the dev Electron binary runs this project.
function launch() {
  const exe = process.env.E2E_EXE ?? electronBin
  const appArgs = process.env.E2E_EXE ? [] : ['.']
  electron = spawn(exe, [...appArgs, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  electron.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d))
  return electron
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null })
  let page = null
  for (let i = 0; i < 80 && !page; i++) {
    const pages = await browser.pages()
    page = pages.find((p) => p.url().startsWith('file://') || p.url().startsWith('http://localhost')) ?? null
    if (!page) await sleep(250)
  }
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => Boolean(window.studio)).catch(() => false)
    if (ready) break
    await sleep(250)
  }
  return { browser, page }
}

// Calls window.studio.* inside the renderer. The function source is inlined into the evaluated
// expression (DevTools evaluation is not subject to the page CSP, unlike new Function).
async function call(page, fn, ...args) {
  const expr = `(${fn.toString()})(window.studio, ...${JSON.stringify(args)})`
  return page.evaluate(expr)
}

async function waitForJob(page, projectId, jobId, timeoutMs = 600_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const job = await call(page, async (s, pid, id) => (await s.listJobs(pid)).find((j) => j.id === id), projectId, jobId)
    if (job && job.status !== 'running' && job.status !== 'queued') return job
    await sleep(1000)
  }
  throw new Error('timed out waiting for job')
}

const probeOut = (path) => {
  const j = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path], { encoding: 'utf8' }))
  return {
    video: j.streams.find((s) => s.codec_type === 'video'),
    hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
    duration: Number(j.format.duration)
  }
}

async function main() {
  // ---- Session 1 ----
  launch()
  let { browser, page } = await connect()
  check('renderer exposes window.studio via preload', await page.evaluate(() => typeof window.studio?.listProjects === 'function'))

  const projects = await call(page, (s) => s.listProjects())
  check('seeded project is listed with its source linked', projects.length === 1 && !projects[0].sourceMissing)

  const settings0 = await call(page, (s) => s.getSettings())
  check('FFmpeg bundled and resolvable in the app', settings0.ffmpegAvailable === true)

  await call(page, (s) => s.setApiKey('sk-ant-e2e-invalid-key-0123456789abcdef'))
  const settings1 = await call(page, (s) => s.getSettings())
  check('API key saved via OS secure storage', settings1.hasApiKey && settings1.keyStorage === 'safeStorage')

  const badShort = await call(page, (s) => s.createShort('e2eproject', [{ startSec: 10, endSec: 5 }]).then(() => 'accepted', (e) => e.message))
  check('malformed segment (end before start) is rejected by IPC validation', /endSec must be after startSec|Invalid request/.test(badShort), badShort)

  const short = await call(page, (s) =>
    s.createShort('e2eproject', [{ startSec: 3, endSec: 13 }, { startSec: 25, endSec: 40 }], 'E2E clip')
  )
  check('manual multi-cut short is created (25s, 2 cuts)', short.segments.length === 2 && short.provenance === 'manual')

  const updated = await call(page, (s, id, settings) =>
    s.updateShort(id, {
      captions: [{ startSec: 4, endSec: 8, text: 'hello from the e2e test' }],
      settings: { ...settings, captionsEnabled: true, captionFontSize: 72 }
    }),
    short.id,
    short.settings
  )
  check('captions and framing settings persist on update', updated.captions.length === 1 && updated.settings.captionsEnabled)

  // Screenshot the real renderer for a visual check.
  await sleep(1200)
  await page.screenshot({ path: shotPath })
  check('renderer shows the video element with the source', await page.evaluate(() => Boolean(document.querySelector('video')?.src)))

  // Export through the real job runner.
  const exp = await call(page, (s, pid, sid, dir) => s.startExport({ projectId: pid, shortIds: [sid], outputDir: dir, overwrite: false }), 'e2eproject', short.id, outDir)
  const expDone = await waitForJob(page, 'e2eproject', exp.id)
  check('export job completes', expDone.status === 'completed', expDone.error ?? expDone.message)
  check(
    'export job reports each short as done with a file path',
    Array.isArray(expDone.items) && expDone.items.length === 1 && expDone.items[0].status === 'done' && Boolean(expDone.items[0].outPath)
  )
  const outFile = join(outDir, 'E2E clip.mp4')
  if (existsSync(outFile)) {
    const o = probeOut(outFile)
    check('exported MP4 is 9:16 1080x1920', o.video.width === 1080 && o.video.height === 1920)
    check('exported MP4 has audio and ~25s duration', o.hasAudio && Math.abs(o.duration - 25) < 0.5, `duration ${o.duration.toFixed(2)}s`)
  } else {
    check('exported MP4 exists', false, outFile)
  }

  // AI analysis with a deliberately invalid key: this is a real call, so the failure must be surfaced.
  // Focus layout: reload so the renderer picks up the new shorts, select one, and check the stage.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(2000)
  // A second clip, so switching between clips can be checked.
  await call(page, (s, pid) => s.createShort(pid, [{ startSec: 60, endSec: 70 }], 'Second clip'), 'e2eproject')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1500)
  // Clips now live in the sidebar. Selecting one opens the focus stage, and the player shows that clip.
  await page.evaluate(() => {
    const list = document.querySelector('[aria-label="Shorts in this project"]')
    const btn = [...(list?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('E2E clip'))
    btn?.click()
  })
  await sleep(1000)
  const focused = await page.evaluate(() =>
    Boolean(document.querySelector('section[aria-label^="Editing"]') && document.querySelector('input[aria-label="Short title"]'))
  )
  check('selecting a clip in the sidebar opens the focus stage and inspector', focused)
  const playerShowsProject = await page.evaluate(() => (document.querySelector('video')?.getAttribute('src') ?? '').startsWith('shorts-media://project/'))
  check('the clip is loaded in the shared video player', playerShowsProject)
  const pickClip = (name) =>
    page.evaluate((n) => {
      const list = document.querySelector('[aria-label="Shorts in this project"]')
      const btn = [...(list?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(n))
      btn?.click()
    }, name)
  await pickClip('Second clip')
  await sleep(800)
  const switched = await page.evaluate(() => document.querySelector('input[aria-label="Short title"]')?.value)
  check('switching clips in the sidebar updates the editor', switched === 'Second clip', `title field: ${switched}`)
  await pickClip('E2E clip')
  await sleep(800)
  const back = await page.evaluate(() => document.querySelector('input[aria-label="Short title"]')?.value)
  check('switching back restores the first clip', back === 'E2E clip', `title field: ${back}`)
  const hasPlayCuts = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /play cuts|stop preview/i.test(b.textContent ?? '')))
  check('there is no Play cuts or preview button', !hasPlayCuts)
  const settingsKey = await page.evaluate(() => {
    const details = document.querySelector('aside details')
    if (details) details.open = true
    return Boolean(document.querySelector('input[placeholder="sk-ant-…"], input[placeholder="sk-ant-..."]'))
  })
  check('Project settings holds the API key field', settingsKey)
  await page.screenshot({ path: join(work, 'focus.png') })

  // Timeline: drag cut 1's end handle left by 48px. At the default zoom (16px/s) that trims 3s.
  const endHandle = await page.waitForSelector('[aria-label="Cut 1 end"]', { timeout: 5000 })
  await endHandle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
  await sleep(300)
  const box = await endHandle.boundingBox()
  const hx = box.x + box.width / 2
  const hy = box.y + box.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx - 48, hy, { steps: 8 })
  await page.mouse.up()
  await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save changes')?.click())
  await sleep(800)
  const trimmed = await call(page, (s, id) => s.listShorts(id).then((list) => list.find((x) => x.title === 'E2E clip')), 'e2eproject')
  // Source strip: thumbnails generate in the background, one image loads through the protocol, and a drag adds a cut.
  let thumbStatus = await call(page, (s, pid) => s.ensureThumbnails(pid), 'e2eproject')
  for (let i = 0; i < 60 && !thumbStatus.ready; i++) {
    await sleep(2000)
    thumbStatus = await call(page, (s, pid) => s.ensureThumbnails(pid), 'e2eproject')
  }
  check('source strip thumbnails are generated and ready', thumbStatus.ready && thumbStatus.count > 0, JSON.stringify(thumbStatus))
  await sleep(500)
  const thumbLoads = await page.evaluate(
    (url) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img.naturalWidth)
        img.onerror = () => resolve(0)
        img.src = url
      }),
    `shorts-media://thumb/e2eproject/0`
  )
  check('a thumbnail image loads through the scoped protocol', thumbLoads > 0, `width ${thumbLoads}`)

  const track = await page.waitForSelector('section[aria-label="Source footage"] [class*="track"]', { timeout: 5000 })
  await track.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
  await sleep(300)
  const tBox = await track.boundingBox()
  const y = tBox.y + tBox.height / 2
  await page.mouse.move(tBox.x + tBox.width * 0.6, y)
  await page.mouse.down()
  await page.mouse.move(tBox.x + tBox.width * 0.65, y, { steps: 6 })
  await page.mouse.up()
  await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save changes')?.click())
  await sleep(800)
  const withStripCut = await call(page, (s, id) => s.listShorts(id).then((list) => list.find((x) => x.title === 'E2E clip')), 'e2eproject')
  check('dragging across the source strip adds a cut', withStripCut.segments.length === 3, `${withStripCut.segments.length} cuts`)

  check(
    'timeline trim drag saves the new cut end (13s → ~10s)',
    trimmed && Math.abs(trimmed.segments[0].endSec - 10) < 0.3 && trimmed.segments[0].startSec === 3,
    trimmed ? `cut 1 = ${trimmed.segments[0].startSec.toFixed(2)}–${trimmed.segments[0].endSec.toFixed(2)}` : 'missing'
  )

  const ana = await call(page, (s, pid) => s.startAnalysis({ projectId: pid, prompt: 'Find the best moments', count: 2, minSec: 30, maxSec: 60, ratio: '9:16' }), 'e2eproject')
  const anaDone = await waitForJob(page, 'e2eproject', ana.id, 900_000)
  check(
    'AI analysis with a bad key fails visibly (no mock results)',
    anaDone.status === 'failed' && /key was rejected|reach the AI|AI request failed|timed out/i.test(anaDone.error ?? ''),
    `${anaDone.status}: ${anaDone.error}`
  )

  // Cancellation: start a longer export, cancel it, verify partial file cleanup.
  const longShort = await call(page, (s) => s.createShort('e2eproject', [{ startSec: 0, endSec: 45 }, { startSec: 60, endSec: 105 }], 'Cancel me'))
  const cancelJob = await call(page, (s, pid, sid, dir) => s.startExport({ projectId: pid, shortIds: [sid], outputDir: dir, overwrite: false }), 'e2eproject', longShort.id, outDir)
  await sleep(2500)
  await call(page, (s, id) => s.cancelJob(id), cancelJob.id)
  const cancelled = await waitForJob(page, 'e2eproject', cancelJob.id)
  check('cancelled export reports cancelled and removes its partial file', cancelled.status === 'cancelled' && !existsSync(join(outDir, 'Cancel me.mp4')), cancelled.status)

  await browser.disconnect()
  electron.kill()
  await sleep(1500)

  // ---- Session 2: persistence across relaunch ----
  launch()
  ;({ browser, page } = await connect())
  const after = await call(page, (s) => s.listShorts('e2eproject'))
  check('shorts and edits survive app relaunch', after.some((s) => s.id === short.id && s.captions.length === 1))
  const jobs = await call(page, (s) => s.listJobs('e2eproject'))
  check('completed export job survives relaunch', jobs.some((j) => j.id === exp.id && j.status === 'completed'))

  // Kill mid-export: the restart must mark the job interrupted, not running.
  const killShort = await call(page, (s) => s.createShort('e2eproject', [{ startSec: 0, endSec: 45 }, { startSec: 60, endSec: 105 }], 'Kill me'))
  const killJob = await call(page, (s, pid, sid, dir) => s.startExport({ projectId: pid, shortIds: [sid], outputDir: dir, overwrite: false }), 'e2eproject', killShort.id, outDir)
  await sleep(2500)
  await browser.disconnect()
  electron.kill('SIGKILL')
  await sleep(1500)

  launch()
  ;({ browser, page } = await connect())
  const restarted = await call(page, (s) => s.listJobs('e2eproject'))
  const interrupted = restarted.find((j) => j.id === killJob.id)
  check('job running at crash is marked interrupted on restart', interrupted?.status === 'interrupted', interrupted?.status)
  await browser.disconnect()
  electron.kill()
}

try {
  await main()
} catch (err) {
  check('e2e harness completed without exception', false, err.message)
} finally {
  electron?.kill()
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} checks passed. Artifacts kept in ${work}`)
  if (existsSync(shotPath)) console.log(`Screenshot: ${shotPath}`)
  process.exitCode = results.every((r) => r.ok) ? 0 : 1
}
