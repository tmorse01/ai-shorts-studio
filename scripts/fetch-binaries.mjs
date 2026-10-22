// Prepares resources/bin (FFmpeg + FFprobe) and resources/whisper (whisper.cpp + base English model)
// so they ship inside the installer. Nothing is fetched at app launch.
//
// FFmpeg: copied from $FFMPEG_DIR, or from whichever ffmpeg is on PATH.
// Whisper: downloaded from the pinned whisper.cpp release and Hugging Face model, verified by SHA-256.
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'resources', 'bin')
const whisperDir = join(root, 'resources', 'whisper')
const exe = process.platform === 'win32' ? '.exe' : ''

const WHISPER_ZIP = {
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
  sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
}
const WHISPER_MODEL = {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'
}

function locate(name) {
  if (process.env.FFMPEG_DIR) {
    const p = join(process.env.FFMPEG_DIR, name + exe)
    if (existsSync(p)) return p
  }
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  const out = execFileSync(finder, [name], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean)
  if (!out) throw new Error(`${name} not found on PATH. Set FFMPEG_DIR to the folder containing it.`)
  return out.trim()
}

async function download(url, dest, sha256) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  const actual = createHash('sha256').update(readFileSync(dest)).digest('hex')
  if (actual !== sha256) throw new Error(`SHA-256 mismatch for ${basename(dest)}: got ${actual}`)
  console.log(`verified ${basename(dest)} (${Math.round(statSync(dest).size / 1e6)} MB)`)
}

// ---- FFmpeg ----
mkdirSync(binDir, { recursive: true })
for (const name of ['ffmpeg', 'ffprobe']) {
  const src = locate(name)
  const target = join(binDir, name + exe)
  copyFileSync(src, target)
  console.log(`copied ${name}${exe} <- ${src} (${Math.round(statSync(target).size / 1e6)} MB)`)
}
const ffmpegLicenses = readdirSync(dirname(locate('ffmpeg'))).filter((f) => /licen[cs]e|readme/i.test(f))
console.log(
  ffmpegLicenses.length
    ? `FFmpeg build licence files nearby: ${ffmpegLicenses.join(', ')}. Check before distributing.`
    : 'No licence file found next to the FFmpeg build. Check the build licence before distributing.'
)

// ---- whisper.cpp ----
if (!existsSync(join(whisperDir, `whisper-cli${exe}`)) || process.env.FORCE_WHISPER === '1') {
  mkdirSync(whisperDir, { recursive: true })
  const work = mkdtempSync(join(tmpdir(), 'whisper-fetch-'))
  const zip = join(work, 'whisper-bin-x64.zip')
  await download(WHISPER_ZIP.url, zip, WHISPER_ZIP.sha256)
  // Use the system bsdtar on Windows: Git's GNU tar on PATH reads "C:" as a remote host.
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  execFileSync(tar, ['-xf', zip, '-C', work])
  const releaseDir = join(work, 'Release')
  for (const f of readdirSync(releaseDir)) {
    if (f === 'whisper-cli.exe' || f.endsWith('.dll')) copyFileSync(join(releaseDir, f), join(whisperDir, f))
  }
  console.log(`installed whisper-cli into ${whisperDir}`)
}
const modelPath = join(whisperDir, 'ggml-base.en.bin')
if (!existsSync(modelPath)) {
  await download(WHISPER_MODEL.url, modelPath, WHISPER_MODEL.sha256)
}
writeFileSync(join(whisperDir, 'README.txt'), 'whisper.cpp (MIT licence) b5454 and ggml-base.en model (MIT). See https://github.com/ggml-org/whisper.cpp\n')
