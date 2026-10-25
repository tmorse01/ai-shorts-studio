import { describe, expect, it, vi } from 'vitest'
import { loadParakeetEngine, loadSherpaModule } from '../src/main/transcription/speechEngine'

// The Parakeet recogniser is a fake. The native addon is never loaded: the module import below is
// mocked in the same shape a CommonJS package has after a dynamic import (the exports on `.default`).
const recognizerCalls = vi.hoisted(() => ({ configs: [] as unknown[] }))

vi.mock('sherpa-onnx-node', () => ({
  default: {
    OfflineRecognizer: class {
      constructor(config: unknown) {
        recognizerCalls.configs.push(config)
      }
      createStream() {
        return { acceptWaveform: () => undefined }
      }
      decode() {
        return undefined
      }
      getResult() {
        return { text: 'hello there', tokens: ['hello'], timestamps: [0.1] }
      }
    }
  }
}))

const MODEL_FILES = {
  'encoder.int8.onnx': '/models/encoder.int8.onnx',
  'decoder.int8.onnx': '/models/decoder.int8.onnx',
  'joiner.int8.onnx': '/models/joiner.int8.onnx',
  'tokens.txt': '/models/tokens.txt'
}

describe('loadSherpaModule', () => {
  it('returns the module when OfflineRecognizer sits on the namespace itself', async () => {
    const OfflineRecognizer = class {}
    const mod = await loadSherpaModule(async () => ({ OfflineRecognizer }))
    expect(mod.OfflineRecognizer).toBe(OfflineRecognizer)
  })

  it('unwraps OfflineRecognizer from the default export of a CommonJS module', async () => {
    const OfflineRecognizer = class {}
    const mod = await loadSherpaModule(async () => ({ default: { OfflineRecognizer } }))
    expect(mod.OfflineRecognizer).toBe(OfflineRecognizer)
  })

  it('throws a plain error when the module has no OfflineRecognizer', async () => {
    await expect(loadSherpaModule(async () => ({ default: {} }))).rejects.toThrow(
      'OfflineRecognizer'
    )
  })
})

describe('loadParakeetEngine', () => {
  it('builds the recogniser from the CommonJS default export and transcribes', async () => {
    recognizerCalls.configs.length = 0
    const engine = await loadParakeetEngine(MODEL_FILES)

    expect(recognizerCalls.configs).toHaveLength(1)
    const config = recognizerCalls.configs[0] as { modelConfig: { tokens: string } }
    expect(config.modelConfig.tokens).toBe('/models/tokens.txt')

    const result = await engine.transcribe(new Float32Array(16000), 16000)
    expect(result.text).toBe('hello there')
    expect(result.tokens).toEqual(['hello'])
  })
})
