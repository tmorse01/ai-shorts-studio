# CLAUDE.md

Guide for building AI Shorts Studio on the `rebuild` branch. Read this before writing code. If a
rule here is wrong, fix it in the same PR as the change that exposed it.

## What we're building

A local-first Windows desktop app (Electron) that turns long footage into vertical shorts. Video
stays on the user's machine. The rebuild replaces the old app on `main`. `main` is reference only.

Work is tracked as epics and tasks on GitHub. Epic 01 (#1) is the app shell. Each task is one PR
against `rebuild` with `Closes #N`.

## Stack

Decided in Epic 01. Items marked _planned_ are not installed yet. Add a dependency only in the task
that needs it.

- Electron, electron-vite, React 18, TypeScript (strict), pnpm
- Vitest for tests, ESLint (flat config), Prettier
- _planned:_ Radix primitives + CSS Modules for UI (no Tailwind, no shadcn)
- _planned:_ Zustand + Immer for state
- _planned:_ TanStack Router with hash history (Electron)
- _planned:_ zod for IPC validation
- _planned:_ Lucide icons

## Folder layout

```
src/
  main/       Electron main process: window, IPC handlers, services (ffmpeg, AI, storage)
  preload/    contextBridge only: the typed IPC surface exposed to the renderer
  renderer/   React app
  shared/     types, schemas and pure logic used by main and renderer
tests/        Vitest specs (*.test.ts), mirrors the feature they cover
docs/rebuild/ DESIGN.md (visual source of truth), VISION.md
site/         public marketing site, separate pnpm project. Do not touch from app work.
```

Renderer features go in feature folders as they land: `src/renderer/features/<feature>/`. Each
folder holds its components, store, hooks and styles. Shared UI primitives live in
`src/renderer/ui/`. Routes live in `src/renderer/routes/`.

Path aliases: `@shared/*` maps to `src/shared/*` and `@renderer/*` maps to `src/renderer/*`. Use
them instead of long relative paths. They are configured in `tsconfig.*.json`,
`electron.vite.config.ts` and `vitest.config.ts`. Change all three together.

## Naming and style

- Prettier decides formatting: no semicolons, single quotes, width 100, no trailing commas.
  Run `pnpm format` before committing.
- Components: `PascalCase.tsx`, one component per file, named export.
- Styles: `PascalCase.module.css` next to the component that uses it.
- Stores, hooks, utilities: `camelCase.ts`. Stores are named `<domain>Store.ts`, hooks `useX.ts`.
- Types and schemas for a domain live in `src/shared/` so main and renderer agree.
- Keep modules small and pure where possible. Put logic in plain functions and test them directly.
- No `any`. Use `unknown` and narrow it. ESLint and `pnpm typecheck` must stay clean with
  `--max-warnings=0`.

## Routing

_Planned (task #22)._ TanStack Router, hash history. Routes:

- `/` dashboard
- `/project/$projectId` project home
- `/project/$projectId/short/$shortId` short editor
- `/settings` settings

Each route file is thin: it composes feature components and reads state from stores. It does not
hold business logic.

## State

_Planned (task #23)._ Zustand with Immer, one store per domain (for example `projectStore`,
`shortStore`, `settingsStore`). Stores live in their feature folder.

- Mutations use Immer drafts inside store actions.
- Persisted UI state (pane sizes, last layout) is stored through the IPC bridge, not browser
  storage. Only per-viewer conveniences use `localStorage`.
- Components read stores through selectors. Do not subscribe to a whole store.

## IPC

_Planned (task #23)._ The renderer never gets `ipcRenderer`. The preload script exposes one typed
object through `contextBridge`.

- Every channel is defined once in `src/shared/` with a zod schema for its input and output.
- Main validates input with the same schema before doing any work.
- Errors thrown in main reach the renderer as typed errors. They show as toasts (see Errors).
- Each new channel gets one round-trip test.

## Undo and redo

_Planned (task #24)._ Every user edit goes through a command. A command knows how to do and undo
itself, and the history records it. If an edit bypasses a command, it does not land in history, and
that is a bug.

- Per-short history for edits inside a short.
- Project-level history for actions such as import and delete short.
- Do, undo, redo, branch-after-undo discards redo, and the history limit are covered by unit tests.

## Styling

Source of truth for visuals: `docs/rebuild/DESIGN.md` (Galactic Occult / Cinematic Noir). Read its
sections 2 (colour), 3 (type) and 10 (implementation) before styling anything.

- All colours, type, spacing, radii and motion durations come from CSS variables in one tokens file
  (_planned: task #20_). No hard-coded hex, rgb or hsl values in components or other stylesheets.
- Use CSS Modules. No global class names outside the tokens and base stylesheets.
- Icons are Lucide icons. No other icon sets and no inline SVG icons.
- Text and surface pairs must meet WCAG AA contrast. A contrast test covers the token pairs.
- Avoid stock-looking dashboards: no extra cards, no unnecessary borders, no large empty panels.
  Editing space comes first.

## Errors and feedback

_Planned (tasks #24 and #25)._ Errors become plain-language toasts with a details view. Each pane
has an error boundary, so one broken pane does not take down the window. Do not show raw stack
traces to the user.

## Testing

- Vitest runs everything: `pnpm test`. Specs live in `tests/` and are named `<thing>.test.ts`.
- Test pure logic directly: undo engine, timeline maths, schemas, store actions.
- The current Vitest environment is `node`. Add a DOM environment (jsdom or happy-dom) in the task
  that first tests a component, not before.
- A bug fix gets a test that fails without the fix.
- Before opening a PR, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`. CI runs
  the same checks on Windows.

### End-to-end tests

- `pnpm e2e` builds, then runs `e2e/*.spec.ts` against the built app (Playwright `_electron`).
- Every test gets a fresh profile through `AISS_USER_DATA`. Use the fixture in `e2e/test.ts`.
- `AISS_E2E=1` fakes Claude, ElevenLabs and Parakeet and takes file picks from the test. FFmpeg is real.
- Fixtures are generated into `e2e/.fixtures/` (gitignored), never committed.
- Target controls with `data-testid="area-thing"`, and only where a spec needs one.

## Adding a pane or feature

1. Check `DESIGN.md` for the area and the components it needs. Reuse primitives from
   `src/renderer/ui/` before adding new ones.
2. Create `src/renderer/features/<feature>/` with the component, its `.module.css`, and a store if
   it has state.
3. Put the types and zod schemas for any IPC in `src/shared/`. Add the channel to the preload bridge
   and the main handler. Validate input in main.
4. Route the change through a command if the user edits content, so it can be undone.
5. Add tests: pure logic, store actions, and one round-trip for each new channel.
6. Use tokens only. Run lint, typecheck, test and build.
7. Open a PR against `rebuild` with `Closes #N`.

## Git and PRs

- Branch from `rebuild`. Open PRs against `rebuild`, never `main`.
- Small PRs, one task per PR. Keep the PR description short: what changed, decisions made, and
  how it was checked.
- Do not commit `out/`, `release/`, `node_modules/` or local binaries.
