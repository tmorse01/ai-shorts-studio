# AI Shorts Studio

A local-first Windows app that turns long footage into short vertical clips. Your video stays on your
machine. Scene detection, speech-to-text (Parakeet) and FFmpeg run locally. Only small sampled frames and
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
pnpm dev            # run the app with hot reload
```

The `rebuild` branch is a ground-up rebuild in progress. The current code is a minimal scaffold: a window
that shows a placeholder. The FFmpeg and Parakeet features from the previous version are not yet ported.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint, strict TypeScript, Vitest |
| `pnpm build` | Compile main, preload and renderer with electron-vite |
| `pnpm package:win` | Build the NSIS installer into `release/` |

## Website and releases

- `site/` is the public Astro marketing site. See [site/README.md](site/README.md).
- `.github/workflows/ci.yml` runs lint, typecheck, tests and build on Windows, and builds the site, on pushes and PRs to `rebuild` and `main`.
- The site deploys to Netlify from GitHub on every push to `main` that touches `site/`. Netlify's GitHub
  integration does the build, using `site/netlify.toml`. Pull requests get preview deploys. No repo secrets are needed.
- `.github/workflows/release.yml` builds the installer on a `v*` tag and attaches it, with a SHA-256 checksum, to a GitHub Release.
  The tag must match the `version` in `package.json`. Cut a release with `git tag v0.1.0 && git push --tags`.

## Known limitations

- **Unsigned installer.** Windows SmartScreen will warn. Code signing is not configured.
- **AI quality is unverified with a real key** in this build. The e2e test confirms the real API call and
  its auth-error path. A successful ranking has not been run against a live key yet.
- **Speech-to-text** uses Parakeet TDT 0.6B v3 (Q8_0, CPU). Silent footage relies on sampled frames, which give
  weak motion information. Suggestions are editable, not calibrated.
- **Captions** come from Parakeet for AI-selected shorts. Manual shorts take typed captions.
- **Narration** is recorded in the app (mono WebM) and mixed over the source. It is not text-to-speech.
- **Music** comes only from a folder you choose. Use tracks you have rights to.
- **Very long footage** is slow: scene detection and transcription read the whole file once per project.
  Transcription is cached per project.
- **Licensing.** The bundled FFmpeg build is a GPL-enabled "full" build. Check its licence before shipping.
  parakeet-cli is built from whisper.cpp (MIT). The Parakeet model's licence is on its Hugging Face model card.
