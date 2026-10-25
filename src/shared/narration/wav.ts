// Encodes decoded audio as a 16-bit PCM WAV file (Epic 10, #108). Channels are mixed down to mono, so a
// voiceover is one track. Pure: the bytes are built in memory and tested without a browser or disk.

const BYTES_PER_SAMPLE = 2
const HEADER_BYTES = 44

export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number
): Uint8Array<ArrayBuffer> {
  const frames = frameCount(channels)
  const dataBytes = frames * BYTES_PER_SAMPLE
  const out = new Uint8Array(new ArrayBuffer(HEADER_BYTES + dataBytes))
  const view = new DataView(out.buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM format chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
  view.setUint16(32, BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (const channel of channels) sum += channel[frame] ?? 0
    const mono = channels.length > 0 ? sum / channels.length : 0
    view.setInt16(HEADER_BYTES + frame * BYTES_PER_SAMPLE, toInt16(mono), true)
  }
  return out
}

// Number of sample frames a decoded take holds (the longest channel).
export function frameCount(channels: readonly Float32Array[]): number {
  return channels.length === 0 ? 0 : Math.max(...channels.map((channel) => channel.length))
}

function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
