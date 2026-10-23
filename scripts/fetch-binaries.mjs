// Prepares resources/bin (FFmpeg + FFprobe) and resources/parakeet (parakeet-cli + Parakeet model)
// so they ship inside the installer. Nothing is fetched at app launch.
//
// FFmpeg: copied from $FFMPEG_DIR, or from whichever ffmpeg is on PATH.
// Parakeet: parakeet-cli is built from a pinned whisper.cpp tag (CPU, CMake); the GGUF model is
// downloaded from Hugging Face and verified by SHA-256. Set CMAKE to use a specific cmake.exe.
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
const parakeetDir = join(root, 'resources', 'parakeet')
const exe = process.platform === 'win32' ? '.exe' : ''

const PARAKEET_SRC = {
  repo: 'https://github.com/ggml-org/whisper.cpp.git',
  tag: 'v1.9.5',
  commit: 'd1be6fde11ac6e0407606b4e42fe72d34add8037'
}
const PARAKEET_MODEL = {
  file: 'ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
  url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
  sha256: '4d64e9e96c2792186d072fde0034df0ad670cf680a2f53069052ead827fd600e'
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

/** Find a file by name anywhere under dir. Multi-config generators put it in a Release subfolder. */
function findFile(dir, name) {
  const hit = readdirSync(dir, { recursive: true }).find((f) => basename(f) === name)
  if (!hit) throw new Error(`${name} was not produced under ${dir}`)
  return join(dir, hit)
}

/** Clone the pinned whisper.cpp tag, check its commit, and build only parakeet-cli on CPU. */
function buildParakeetCli() {
  const work = mkdtempSync(join(tmpdir(), 'parakeet-build-'))
  const src = join(work, 'whisper.cpp')
  execFileSync('git', ['clone', '--depth', '1', '--branch', PARAKEET_SRC.tag, PARAKEET_SRC.repo, src], { stdio: 'inherit' })
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== PARAKEET_SRC.commit) {
    throw new Error(`whisper.cpp ${PARAKEET_SRC.tag} resolved to ${head}, expected ${PARAKEET_SRC.commit}`)
  }
  const cmake = process.env.CMAKE ?? 'cmake'
  const build = join(src, 'build')
  execFileSync(
    cmake,
    ['-S', src, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DGGML_CUDA=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF'],
    { stdio: 'inherit' }
  )
  execFileSync(cmake, ['--build', build, '--config', 'Release', '--target', 'parakeet-cli', '-j', '8'], { stdio: 'inherit' })
  const cli = findFile(build, `parakeet-cli${exe}`)
  const outDir = dirname(cli)
  for (const f of readdirSync(outDir)) {
    if (f === `parakeet-cli${exe}` || f.endsWith('.dll')) copyFileSync(join(outDir, f), join(parakeetDir, f))
  }
  console.log(`built parakeet-cli ${PARAKEET_SRC.tag} into ${parakeetDir}`)
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

// ---- Parakeet ----
mkdirSync(parakeetDir, { recursive: true })
if (!existsSync(join(parakeetDir, `parakeet-cli${exe}`)) || process.env.FORCE_PARAKEET === '1') {
  buildParakeetCli()
}
const modelPath = join(parakeetDir, PARAKEET_MODEL.file)
if (!existsSync(modelPath)) {
  await download(PARAKEET_MODEL.url, modelPath, PARAKEET_MODEL.sha256)
}
writeFileSync(
  join(parakeetDir, 'README.txt'),
  [
    `parakeet-cli built from whisper.cpp ${PARAKEET_SRC.tag} (${PARAKEET_SRC.commit}), MIT. https://github.com/ggml-org/whisper.cpp`,
    `Model ${PARAKEET_MODEL.file}: NVIDIA Parakeet TDT 0.6B v3, converted to GGUF by ggml-org. Check the licence on the model card: https://huggingface.co/ggml-org/parakeet-GGUF`,
    ''
  ].join('\n')
)
