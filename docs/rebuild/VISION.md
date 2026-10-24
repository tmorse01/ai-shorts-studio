# Rebuild vision

AI Shorts Studio is being rebuilt from the ground up, one feature at a time. Each feature is an
epic issue on GitHub, groomed into full requirements before any code is written.

## The workflow we're building for

1. Open a project and import a large source video (plus B-roll — e.g. mountain biking footage and
   scenic shots of Whistler).
2. Make **many shorts** from that footage. A project holds many shorts.
3. Each short is 30–60s, typically **5–6 cuts of ~5s** pulled from different parts of the footage,
   with:
   - narration (recorded, imported, or text-to-speech from a script)
   - on-screen captions
   - an optional music bed
   - occasional titles, text animations or transitions
4. Export them all for TikTok / Reels / YouTube Shorts.

## Principles

- **The user stays in control.** AI drafts; the user decides. Anything the AI produces is a normal,
  fully editable timeline — never a black box.
- **Speed of making many shorts** is the core value, more than deep editing power.
- **AI is sprinkled in**, not the centre: write scripts, generate several scripts at once, assemble
  a draft short that follows a script (choosing matching A-roll and B-roll), batch-generate drafts.
- **Local-first.** Electron + React + TypeScript + ffmpeg; footage stays on the user's machine.

## Process

- Board: GitHub Project — Backlog → Grooming → Ready → In Progress → Done.
- Epics are numbered in build order (`Epic 01: App shell & core layout` first). Each one has a
  goal, an initial scope, open questions and a grooming checklist.
- Grooming an epic means: user stories, acceptance criteria, a layout sketch, and task sub-issues.
  Only then does it move to Ready.
- Work happens on the `rebuild` branch; the old code on `main` stays as a reference until the
  rebuild replaces it.

## Out of scope for now

- Automatic subject tracking / auto-reframe (manual reframing is in Epic 09).
