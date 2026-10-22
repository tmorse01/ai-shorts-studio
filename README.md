# AI Shorts Studio

A local-first Windows app that turns long footage into short vertical clips. Your video stays on your
machine. Scene detection, speech-to-text (Whisper) and FFmpeg run locally. Only small sampled frames and
speech excerpts go to Anthropic, and only when you run AI analysis.

## Flow

1. Create a project and import an MP4/MOV. The file is referenced in place, not copied or uploaded.
2. Analyze with AI: local scene detection and transcription, then Claude ranks 1–5 shorts made of
   1–4 cuts each (30–60s by default).
3. Review the suggestions. Adjust cuts, framing (crop or fit), captions, music and narration.
4. Export selected shorts to an H.264/AAC MP4 folder you choose. Every export is probed afterwards.

Manual selection (Set in / Set out / Add manual short) works without any API key.

## Setup

```bash
pnpm install
pnpm fetch:bin      # copies FFmpeg from PATH and downloads whisper.cpp + base.en model (SHA-256 verified)
pnpm dev            # run the app with hot reload
```

Set `FFMPEG_DIR` if FFmpeg is not on PATH. Your Anthropic API key is entered in the app's Settings and
stored with Windows DPAPI via Electron `safeStorage`. It is never written to disk in plain text.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Lint, strict TypeScript, Vitest (unit + real FFmpeg + real Whisper) |
| `pnpm build` | Compile main, preload and renderer with electron-vite |
| `pnpm package:win` | Build the NSIS installer into `release/` |
| `pnpm e2e` | Drive the real Electron app over DevTools: import, export, AI error path, cancel, relaunch, crash recovery |

## Website and releases

- `site/` is the public Astro marketing site. See [site/README.md](site/README.md).
- `.github/workflows/ci.yml` runs lint, typecheck and tests on Windows, and builds the site, on every push and PR.
- `.github/workflows/site.yml` deploys the site to Netlify on every push to `main` that touches `site/`.
  Secrets: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
- `.github/workflows/release.yml` builds the installer on a `v*` tag and attaches it, with a SHA-256 checksum, to a GitHub Release.
  The tag must match the `version` in `package.json`. Cut a release with `git tag v0.1.0 && git push --tags`.

## Known limitations

- **Unsigned installer.** Windows SmartScreen will warn. Code signing is not configured.
- **AI quality is unverified with a real key** in this build. The e2e test confirms the real API call and
  its auth-error path. A successful ranking has not been run against a live key yet.
- **Speech-to-text is English only** (`ggml-base.en`). Silent footage relies on sampled frames, which give
  weak motion information. Suggestions are editable, not calibrated.
- **Captions** come from Whisper for AI-selected shorts. Manual shorts take typed captions.
- **Narration** is recorded in the app (mono WebM) and mixed over the source. It is not text-to-speech.
- **Music** comes only from a folder you choose. Use tracks you have rights to.
- **Very long footage** is slow: scene detection and transcription read the whole file once per project.
  Transcription is cached per project.
- **Licensing.** The bundled FFmpeg build is a GPL-enabled "full" build. Check its licence before shipping.
  whisper.cpp and the model are MIT.
