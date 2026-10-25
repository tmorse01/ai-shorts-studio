// The seam between the narration recorder and the browser's media APIs (Epic 10, #108). The recorder only
// talks to these interfaces, so tests pass a fake microphone and a fake media recorder and never touch a
// device, the network or a real recording. The browser implementation lives in browserMicDriver.ts.

export interface MicDevice {
  id: string
  label: string
}

export interface DecodedAudio {
  channels: Float32Array[]
  sampleRate: number
}

// One open microphone. It is opened before the count-in, so a permission problem shows up early.
export interface MicSession {
  // Input level from 0 (silence) to 1 (full scale), read while the mic is open.
  level: () => number
  startRecording: () => void
  // Stops the recorder and returns what it captured.
  stopRecording: () => Promise<Blob>
  // Releases the microphone.
  close: () => void
}

export interface MicDriver {
  listMicrophones: () => Promise<MicDevice[]>
  // Opens a microphone. A null id means the system default. Rejects with the browser's error.
  open: (deviceId: string | null) => Promise<MicSession>
  // Decodes a recorded blob into samples, so it can be encoded as WAV.
  decode: (blob: Blob) => Promise<DecodedAudio>
}
