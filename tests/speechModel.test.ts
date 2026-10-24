import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../src/main/errors'
import {
  PARAKEET_MODEL,
  ensureSpeechModel,
  modelFolder,
  type SpeechModel
} from '../src/main/transcription/speechModel'

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string =>
  createHash('sha256').update(bytes).digest('hex')

function modelWith(
  files: { name: string; body: Uint8Array<ArrayBuffer>; sha?: string }[]
): SpeechModel {
  return {
    id: 'test-model',
    files: files.map((file) => ({
      name: file.name,
      url: `https://models.test/${file.name}`,
      sha256: file.sha ?? sha256(file.body),
      sizeBytes: file.body.byteLength
    }))
  }
}

// A fetch that serves the bodies by file name and counts how often each one is requested.
function fakeFetch(bodies: Record<string, Uint8Array<ArrayBuffer>>, status = 200) {
  const requested: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    const name = url.slice(url.lastIndexOf('/') + 1)
    requested.push(name)
    const body = bodies[name]
    if (!body) return new Response('missing', { status: 404 })
    if (status !== 200) return new Response('nope', { status })
    return new Response(new Blob([body]), { status: 200 })
  }) as typeof fetch
  return { fetchImpl, requested }
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'models-'))
}

describe('speech model download', () => {
  it('downloads each missing file into app data and reports progress up to 1', async () => {
    const root = tempRoot()
    const first = new TextEncoder().encode('first file body')
    const second = new TextEncoder().encode('second')
    const model = modelWith([
      { name: 'a.onnx', body: first },
      { name: 'b.txt', body: second }
    ])
    const { fetchImpl } = fakeFetch({ 'a.onnx': first, 'b.txt': second })
    const progress: number[] = []

    const paths = await ensureSpeechModel({
      modelsRoot: root,
      model,
      fetchImpl,
      onProgress: (fraction) => progress.push(fraction)
    })

    expect(paths).toEqual({
      'a.onnx': join(modelFolder(root, model), 'a.onnx'),
      'b.txt': join(modelFolder(root, model), 'b.txt')
    })
    expect(readFileSync(paths['a.onnx'] as string, 'utf8')).toBe('first file body')
    expect(progress[progress.length - 1]).toBe(1)
    expect(Math.max(...progress)).toBeLessThanOrEqual(1)
  })

  it('does not download a file that is already in place at its size', async () => {
    const root = tempRoot()
    const body = new TextEncoder().encode('present')
    const model = modelWith([{ name: 'a.onnx', body }])
    const folder = modelFolder(root, model)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'a.onnx'), body)
    const { fetchImpl, requested } = fakeFetch({ 'a.onnx': body })

    await ensureSpeechModel({ modelsRoot: root, model, fetchImpl })

    expect(requested).toEqual([])
  })

  it('shares one download between two callers that ask at the same time', async () => {
    const root = tempRoot()
    const body = new TextEncoder().encode('shared')
    const model = modelWith([{ name: 'a.onnx', body }])
    const { fetchImpl, requested } = fakeFetch({ 'a.onnx': body })

    await Promise.all([
      ensureSpeechModel({ modelsRoot: root, model, fetchImpl }),
      ensureSpeechModel({ modelsRoot: root, model, fetchImpl })
    ])

    expect(requested).toEqual(['a.onnx'])
  })

  it('rejects a file whose checksum does not match and leaves nothing installed', async () => {
    const root = tempRoot()
    const body = new TextEncoder().encode('tampered')
    const model = modelWith([{ name: 'a.onnx', body, sha: 'f'.repeat(64) }])
    const { fetchImpl } = fakeFetch({ 'a.onnx': body })

    const run = ensureSpeechModel({ modelsRoot: root, model, fetchImpl })
    await expect(run).rejects.toBeInstanceOf(UserFacingError)

    const target = join(modelFolder(root, model), 'a.onnx')
    expect(existsSync(target)).toBe(false)
    expect(existsSync(`${target}.part`)).toBe(false)
  })

  it('fails with a plain message when the server refuses the download', async () => {
    const root = tempRoot()
    const body = new TextEncoder().encode('x')
    const model = modelWith([{ name: 'a.onnx', body }])
    const { fetchImpl } = fakeFetch({ 'a.onnx': body }, 503)

    await expect(ensureSpeechModel({ modelsRoot: root, model, fetchImpl })).rejects.toThrow(
      'The speech model could not be downloaded.'
    )
  })

  it('pins the Parakeet files with a SHA-256 for each one', () => {
    expect(PARAKEET_MODEL.files.map((file) => file.name)).toEqual([
      'encoder.int8.onnx',
      'decoder.int8.onnx',
      'joiner.int8.onnx',
      'tokens.txt'
    ])
    for (const file of PARAKEET_MODEL.files) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
