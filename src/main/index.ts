import { app, BrowserWindow, protocol, shell } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { Store } from './store'
import { SecretStore } from './secrets'
import { JobRunner } from './jobs'
import { registerIpc } from './ipc'
import { thumbDir, thumbFileName } from './thumbnails'
import { pickMusicTrack } from './music'
import { clipFrameFile, posterFile } from './poster'

const MEDIA_SCHEME = 'shorts-media'
const DEV_RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

// Brand values mirrored from src/renderer/theme/tokens.css. Keep these in step with the tokens.
const WINDOW_BACKGROUND = '#0a0a0a' // --ink-0
const TITLE_BAR_COLOR = '#111111' // --surface-0
const TITLE_BAR_SYMBOL = '#a3a3a3' // --text-2
const TITLE_BAR_HEIGHT = 36 // --titlebar-h

// Must run before app.ready: lets the renderer stream local footage via <video> with Range support.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: WINDOW_BACKGROUND,
    title: 'AI Shorts Studio',
    show: false,
    // Custom title bar drawn by the renderer. Windows keeps its own min/max/close and Snap Layouts on top of it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLE_BAR_COLOR, symbolColor: TITLE_BAR_SYMBOL, height: TITLE_BAR_HEIGHT },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Only the app's own renderer may load. Any other navigation or popup goes to the OS browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_RENDERER_URL) {
    void mainWindow.loadURL(DEV_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isAllowedRendererUrl(url: string): boolean {
  if (url.startsWith('file://')) return true
  return Boolean(DEV_RENDERER_URL && url.startsWith(DEV_RENDERER_URL))
}

/** Thumbnail images for a source strip: `shorts-media://thumb/<assetId>/<index>` only. */
function serveThumbnail(url: URL, store: Store, userDataDir: string): Response {
  const [, assetId, index] = url.pathname.split('/')
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(assetId ?? '') || !/^\d{1,4}$/.test(index ?? '')) {
    return new Response('Not found', { status: 404 })
  }
  let projectId: string
  try {
    projectId = store.findMediaAsset(assetId).project.id
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const file = join(thumbDir(userDataDir, projectId, assetId), thumbFileName(Number(index)))
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
}

/** Serve a cached JPEG, or 404 when it is not there yet. */
function serveJpeg(file: string | null): Response {
  if (!file || !existsSync(file)) return new Response('Not found', { status: 404 })
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
}

/** Card poster for a media asset: `shorts-media://poster/<assetId>` only. */
function servePoster(url: URL, store: Store, userDataDir: string): Response {
  const assetId = url.pathname.replace(/^\//, '')
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(assetId)) return new Response('Not found', { status: 404 })
  try {
    return serveJpeg(posterFile(userDataDir, store.findMediaAsset(assetId).project.id, assetId))
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

/** Clip card frame: `shorts-media://clip/<shortId>` only. A 404 makes the card fall back to its source poster. */
function serveClipFrame(url: URL, store: Store, userDataDir: string): Response {
  const shortId = url.pathname.replace(/^\//, '')
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shortId)) return new Response('Not found', { status: 404 })
  try {
    return serveJpeg(clipFrameFile(userDataDir, store.getShort(shortId).projectId, shortId))
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
}

/** Stream a local file. Supports byte ranges so scrubbing seeks instead of re-reading the whole file. */
function serveFile(source: string, range: string | null): Response {
  const ext = source.slice(source.lastIndexOf('.')).toLowerCase()
  const type = MEDIA_TYPES[ext] ?? 'application/octet-stream'
  const size = statSync(source).size
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const body = Readable.toWeb(createReadStream(source, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    })
  }
  const body = Readable.toWeb(createReadStream(source)) as ReadableStream
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
  })
}

/**
 * Preview audio for one short: `shorts-media://audio/<shortId>/music` or `.../narration`. The renderer
 * names only the short and the kind; the file comes from the store, never from a renderer path.
 */
function serveShortAudio(url: URL, store: Store, range: string | null): Response {
  const [, shortId, kind] = url.pathname.split('/')
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shortId ?? '')) return new Response('Not found', { status: 404 })
  let file: string | null = null
  try {
    const short = store.getShort(shortId)
    if (kind === 'music') file = pickMusicTrack(store.musicPaths(short.projectId), shortId)
    else if (kind === 'narration') file = short.narrationPath
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!file || !existsSync(file)) return new Response('Not found', { status: 404 })
  return serveFile(file, range)
}

/**
 * Serve footage for a known media asset only: the renderer can ask for `shorts-media://media/<assetId>`
 * and nothing else.
 */
function registerMediaProtocol(store: Store, userDataDir: string): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.host === 'thumb') return serveThumbnail(url, store, userDataDir)
    if (url.host === 'poster') return servePoster(url, store, userDataDir)
    if (url.host === 'clip') return serveClipFrame(url, store, userDataDir)
    if (url.host === 'audio') return serveShortAudio(url, store, request.headers.get('range'))
    const id = url.pathname.replace(/^\//, '')
    if (url.host !== 'media' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return new Response('Not found', { status: 404 })
    }
    // Prefer the H.264 preview when one exists; otherwise the original file.
    let source: string | null = null
    try {
      const { asset } = store.findMediaAsset(id)
      source = asset.proxyPath && existsSync(asset.proxyPath) ? asset.proxyPath : asset.path
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (!source || !existsSync(source)) return new Response('Source missing', { status: 410 })
    return serveFile(source, request.headers.get('range'))
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    const userData = app.getPath('userData')
    const store = new Store(userData)
    const secrets = new SecretStore(userData)
    const jobs = new JobRunner({
      store,
      userDataDir: userData,
      getApiKey: () => secrets.read(),
      notify: (job) => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('job:update', job)
      }
    })
    registerMediaProtocol(store, userData)
    registerIpc({ store, secrets, jobs, userDataDir: userData, getWindow: () => mainWindow })
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
