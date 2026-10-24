// Where the analysis stages keep the frames they sample for a media item. It sits in the project's
// cache folder, so it can be deleted and rebuilt without losing any project data.
import { join } from 'node:path'

export function analysisFramesDir(projectFolder: string, mediaId: string): string {
  return join(projectFolder, 'cache', 'analysis', 'frames', mediaId)
}
