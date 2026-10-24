// The Parakeet speech model: the files it needs, where they come from, and how they are fetched into
// app data. A file is downloaded once, streamed to a .part file while its SHA-256 is computed, and only
// renamed into place when the checksum matches. Tests pass a fake fetch and a temp folder.
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { UserFacingError } from '../errors'

export interface SpeechModelFile {
  /** File name inside the model folder. The engine refers to files by these names. */
  name: string
  url: string
  sha256: string
  sizeBytes: number
}

export interface SpeechModel {
  id: string
  files: readonly SpeechModelFile[]
}

const HF_REPO = 'https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8'

export const PARAKEET_MODEL: SpeechModel = {
  id: 'parakeet-tdt-0.6b-v2-int8',
  files: [
    {
      name: 'encoder.int8.onnx',
      url: `${HF_REPO}/resolve/main/encoder.int8.onnx`,
      sha256: 'a32b12d17bbbc309d0686fbbcc2987b5e9b8333a7da83fa6b089f0a2acd651ab',
      sizeBytes: 652184296
    },
    {
      name: 'decoder.int8.onnx',
      url: `${HF_REPO}/resolve/main/decoder.int8.onnx`,
      sha256: 'b6bb64963457237b900e496ee9994b59294526439fbcc1fecf705b31a15c6b4e',
      sizeBytes: 7257753
    },
    {
      name: 'joiner.int8.onnx',
      url: `${HF_REPO}/resolve/main/joiner.int8.onnx`,
      sha256: '7946164367946e7f9f29a122407c3252b680dbae9a51343eb2488d057c3c43d2',
      sizeBytes: 1739080
    },
    {
      name: 'tokens.txt',
      url: `${HF_REPO}/resolve/main/tokens.txt`,
      sha256: 'ec182b70dd42113aff6c5372c75cac58c952443eb22322f57bbd7f53977d497d',
      sizeBytes: 9384
    }
  ]
}

export type SpeechModelPaths = Record<string, string>

export interface EnsureModelOptions {
  /** App data folder that holds every downloaded model. */
  modelsRoot: string
  model?: SpeechModel
  fetchImpl?: typeof fetch
  /** Download progress as a fraction from 0 to 1, across all files still to download. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export function modelFolder(modelsRoot: string, model: SpeechModel = PARAKEET_MODEL): string {
  return join(modelsRoot, model.id)
}

// Models in progress, keyed by folder, so two jobs that need the model do not download it twice.
const inflight = new Map<string, Promise<SpeechModelPaths>>()

/**
 * Makes sure every file of the model is in place and returns their paths by name. A file that is
 * already there at the expected size is not fetched again. Anything else is downloaded and checked.
 */
export function ensureSpeechModel(options: EnsureModelOptions): Promise<SpeechModelPaths> {
  const model = options.model ?? PARAKEET_MODEL
  const folder = modelFolder(options.modelsRoot, model)
  const running = inflight.get(folder)
  if (running) return running
  const work = fetchMissingFiles(folder, model, options).finally(() => inflight.delete(folder))
  inflight.set(folder, work)
  return work
}

async function fetchMissingFiles(
  folder: string,
  model: SpeechModel,
  options: EnsureModelOptions
): Promise<SpeechModelPaths> {
  await mkdir(folder, { recursive: true })
  const missing: SpeechModelFile[] = []
  for (const file of model.files) {
    if (!(await isInPlace(join(folder, file.name), file.sizeBytes))) missing.push(file)
  }
  const totalBytes = missing.reduce((sum, file) => sum + file.sizeBytes, 0)
  let doneBytes = 0
  for (const file of missing) {
    await downloadVerified(file, join(folder, file.name), {
      fetchImpl: options.fetchImpl ?? fetch,
      signal: options.signal,
      onBytes: (bytes) => {
        if (totalBytes > 0) options.onProgress?.(Math.min(1, (doneBytes + bytes) / totalBytes))
      }
    })
    doneBytes += file.sizeBytes
  }
  options.onProgress?.(1)
  return Object.fromEntries(model.files.map((file) => [file.name, join(folder, file.name)]))
}

async function isInPlace(path: string, sizeBytes: number): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size === sizeBytes
  } catch {
    return false
  }
}

interface DownloadOptions {
  fetchImpl: typeof fetch
  signal?: AbortSignal
  onBytes: (bytes: number) => void
}

/**
 * Streams one file to `<target>.part`, hashing it as it goes. The file only takes its final name when
 * the SHA-256 matches. A mismatch deletes the partial file, so a bad download never looks installed.
 */
export async function downloadVerified(
  file: SpeechModelFile,
  target: string,
  options: DownloadOptions
): Promise<void> {
  const part = `${target}.part`
  const response = await options.fetchImpl(file.url, { signal: options.signal })
  if (!response.ok || !response.body) {
    throw new UserFacingError(
      'The speech model could not be downloaded.',
      `${file.name}: HTTP ${response.status}`
    )
  }

  const hash = createHash('sha256')
  const out = createWriteStream(part)
  let received = 0
  try {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.byteLength
      if (!out.write(value)) await once(out, 'drain')
      options.onBytes(received)
    }
    out.end()
    await once(out, 'finish')
  } catch (error) {
    out.destroy()
    await rm(part, { force: true })
    throw error
  }

  const digest = hash.digest('hex')
  if (digest !== file.sha256) {
    await rm(part, { force: true })
    throw new UserFacingError(
      'The speech model failed its checksum check. Try the transcript again.',
      `${file.name}: expected ${file.sha256}, got ${digest}`
    )
  }
  await rename(part, target)
}
