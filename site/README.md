# AI Shorts Studio website

Static Astro site for the marketing pages and the Windows download link. It lives in `site/` and is
independent of the Electron app: it has its own `package.json` and lockfile.

## Local development

```bash
cd site
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # writes dist/
pnpm preview    # serves dist/ locally
```

## Where things are

- `src/config.ts`: repo owner and name, and the download URL. Change the owner here if the repo moves.
- `src/styles/tokens.css`: colours from `docs/BRAND.md`. Keep them in step with the app.
- `src/pages/`: `index.astro` (home) and `privacy.astro`.
- `public/icon.svg`: copied from `resources/icon.svg`.

The download button points at `releases/latest/download/AI-Shorts-Studio-Setup.exe`. That name comes
from `build.nsis.artifactName` in the root `package.json`, so the link stays valid for every release.

## Deploy

The site is deployed by Netlify's GitHub integration (project `ai-shorts-studio-demo`). Every push to
`main` that touches `site/` triggers a build, and pull requests get preview deploys. The Netlify build
settings are:

- Base directory: `site`
- Build command and publish directory: in `netlify.toml` (`pnpm run build`, `dist`)

pnpm is pinned through the `packageManager` field in `package.json`. No repository secrets are needed.
Pull requests also run a site build check in `.github/workflows/ci.yml`.
