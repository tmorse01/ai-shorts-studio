import { app, BrowserWindow, protocol, shell } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { Store } from './store'
import { SecretStore } from './secrets'
import { JobRunner } from './jobs'
import { registerIpc } from './ipc'
import { thumbDir, thumbFileName } from './thumbnails'

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

/** Thumbnail images for the source strip: `shorts-media://thumb/<projectId>/<index>` only. */
function serveThumbnail(url: URL, userDataDir: string): Response {
  const [, projectId, index] = url.pathname.split('/')
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId ?? '') || !/^\d{1,4}$/.test(index ?? '')) {
    return new Response('Not found', { status: 404 })
  }
  const file = join(thumbDir(userDataDir, projectId), thumbFileName(Number(index)))
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
}

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm'
}

/**
 * Serve footage for an allowed project only: the renderer can ask for `shorts-media://project/<id>`
 * and nothing else. Supports byte ranges so scrubbing seeks instead of re-reading the whole file.
 */
function registerMediaProtocol(store: Store, userDataDir: string): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.host === 'thumb') return serveThumbnail(url, userDataDir)
    const id = url.pathname.replace(/^\//, '')
    if (url.host !== 'project' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return new Response('Not found', { status: 404 })
    }
    // Prefer the H.264 preview when one exists; otherwise the original file.
    let source: string | null = null
    try {
      const project = store.getProject(id)
      source = project.proxyPath && existsSync(project.proxyPath) ? project.proxyPath : project.sourcePath
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (!source || !existsSync(source)) return new Response('Source missing', { status: 410 })

    const ext = source.slice(source.lastIndexOf('.')).toLowerCase()
    const type = VIDEO_TYPES[ext] ?? 'application/octet-stream'
    const size = statSync(source).size
    const range = request.headers.get('range')
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
