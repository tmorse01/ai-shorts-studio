// The real microphone driver: getUserMedia for input, an AnalyserNode for the level meter, and a
// MediaRecorder for the take. Only the browser runs this, so the logic around it is tested with fakes
// (see micDriver.ts). The recorder writes WebM/Opus; decode turns it into samples for the WAV encoder.
import type { DecodedAudio, MicDevice, MicDriver, MicSession } from './micDriver'

function rms(samples: Float32Array): number {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.min(1, Math.sqrt(sum / Math.max(samples.length, 1)) * 2)
}

function preferredMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

export const browserMicDriver: MicDriver = {
  async listMicrophones(): Promise<MicDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Microphone ${index + 1}`
      }))
  },

  async open(deviceId: string | null): Promise<MicSession> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    })
    const context = new AudioContext()
    void context.resume()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)

    const mimeType = preferredMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    let chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }

    return {
      level: () => {
        analyser.getFloatTimeDomainData(buffer)
        return rms(buffer)
      },
      startRecording: () => {
        chunks = []
        recorder.start(1000)
      },
      stopRecording: () =>
        new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }))
          recorder.onerror = () => reject(new Error('The recording stopped unexpectedly.'))
          recorder.stop()
        }),
      close: () => {
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      }
    }
  },

  async decode(blob: Blob): Promise<DecodedAudio> {
    const context = new AudioContext()
    try {
      const audio = await context.decodeAudioData(await blob.arrayBuffer())
      const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
        audio.getChannelData(index).slice()
      )
      return { channels, sampleRate: audio.sampleRate }
    } finally {
      void context.close()
    }
  }
}
