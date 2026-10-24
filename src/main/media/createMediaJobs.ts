// Wires the media job queue to the real FFmpeg tools. The only file in the media layer that imports
// Electron; everything it calls is tested on its own.
import { app } from 'electron'
import { JobQueue, unavailableExecutors, type JobExecutors } from '../jobs/jobQueue'
import { resolveBinary, type BinaryLocation } from './binaries'
import { probeMedia } from './probeMedia'

export function createMediaJobs(): JobQueue {
  const location: BinaryLocation = {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }
  // The binary is looked up when a job runs, not at startup, so a missing tool fails one job with a
  // clear message instead of stopping the app.
  const executors: JobExecutors = {
    ...unavailableExecutors(),
    probe: ({ path }, { signal }) =>
      probeMedia(path, { ffprobe: resolveBinary('ffprobe', location), signal })
  }
  return new JobQueue(executors)
}
