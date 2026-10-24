// Copies FFmpeg and FFprobe into resources/bin. Dev runs read them from there, and the installer
// ships them from there. Nothing is fetched at app launch.
//
// Source: the folder in $FFMPEG_DIR if it has both tools, otherwise whichever ffmpeg and ffprobe are
// on PATH. Check the build's licence before you distribute an installer.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'resources', 'bin')
const exe = process.platform === 'win32' ? '.exe' : ''

function locate(name) {
  if (process.env.FFMPEG_DIR) {
    const p = join(process.env.FFMPEG_DIR, name + exe)
    if (existsSync(p)) return p
  }
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  const out = execFileSync(finder, [name], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean)
  if (!out)
    throw new Error(`${name} not found on PATH. Set FFMPEG_DIR to the folder containing it.`)
  return out.trim()
}

mkdirSync(binDir, { recursive: true })
for (const name of ['ffmpeg', 'ffprobe']) {
  const src = locate(name)
  const target = join(binDir, name + exe)
  copyFileSync(src, target)
  console.log(`copied ${name}${exe} <- ${src} (${Math.round(statSync(target).size / 1e6)} MB)`)
}
