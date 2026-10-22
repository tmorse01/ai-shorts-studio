// Single place for the public repo and download details. Keep in step with the
// electron-builder artifactName in the root package.json.
const owner = 'tmorse01'
const repo = 'ai-shorts-studio'
const repoUrl = `https://github.com/${owner}/${repo}`

export const site = {
  name: 'AI Shorts Studio',
  tagline: 'Turn long footage into short vertical clips, on your own machine.',
  description:
    'A local-first Windows app that turns long footage into 30 to 60 second vertical shorts. Scene detection, transcription and FFmpeg run on your PC. AI ranking is optional.',
  repoUrl,
  releasesUrl: `${repoUrl}/releases`,
  latestInstallerUrl: `${repoUrl}/releases/latest/download/AI-Shorts-Studio-Setup.exe`
}
