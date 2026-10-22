# AI Shorts Studio: Brand

Status: **adopted, Option A (Mono Signal).** The app's tokens in `src/renderer/theme/tokens.css` and the window colours in `src/main/index.ts` match this document. If you change a value here, change it there too, then run `pnpm test`.

---

## 1. Brand in one paragraph

A quiet, black-and-white editing room. The interface is neutral so the footage is the brightest thing on screen. One warm highlight, signal orange, marks only what is live right now: the playhead, the selected cut, the primary action, and the active tab. Everything else is grey. It should feel like a pro tool that is fast to use, not a social app trying to be loud.

## 2. Principles

1. **Neutral first.** Surfaces, text, borders, tracks, and timeline cuts are grey. Colour is the exception.
2. **One highlight per view.** If two things are highlighted, neither is.
3. **Highlight means "live".** Playhead, selected cut, primary button, active tab, recording. Never decoration.
4. **Footage is the colour.** The preview and thumbnails carry the saturation. The chrome does not compete with them.
5. **Timecodes are data.** Monospaced, tabular figures, always readable.
6. **Plain language.** Labels say what happens: "Export selected", not "Process".

## 3. Colour

### Neutrals

| Role | Token | Hex | Used for |
|---|---|---|---|
| Background | `--ink-0` | `#0A0A0A` | App background, video letterbox |
| Surface 0 | `--surface-0` | `#111111` | Side panes, title bar, status bar |
| Surface 1 | `--surface-1` | `#171717` | Cards, inputs, timeline lanes |
| Surface 2 | `--surface-2` | `#202020` | Hover, voice and music blocks |
| Border | `--border` | `#262626` | Dividers, control edges |
| Border strong | `--border-strong` | `#3A3A3A` | Hover borders, dashed music block, menus |
| Text | `--text` | `#F5F5F5` | Titles, values |
| Text secondary | `--text-2` | `#A3A3A3` | Labels, metadata, neutral blocks |
| Text tertiary | `--text-3` | `#636363` | Disabled and ruler ticks only |

### Highlight (live state only)

| Role | Token | Hex | Used for |
|---|---|---|---|
| Highlight fill | `--primary` | `#FF6A2B` (Signal Orange) | Primary button, playhead progress fill, focus ring |
| Highlight hover | `--primary-hover` | `#FF7F4D` | Hover on primary |
| Highlight pressed | `--primary-press` | `#E85A1C` | Pressed on primary |
| Highlight tint | `--primary-soft` | `rgba(255, 106, 43, 0.16)` | Selected card, AI badge |
| Highlight text | `--primary-ink` | `#FF6A2B` | Highlight as text or icon on dark |
| Text on highlight | `--primary-on` | `#0A0A0A` | Label on the orange fill |

### Timeline

| Role | Token | Hex | Used for |
|---|---|---|---|
| Cut 1 | `--cut-1` | `#F5F5F5` | Odd cuts, and the first cut in the source strip |
| Cut 2 | `--cut-2` | `#B3B3B3` | Second cut |
| Cut 3 | `--cut-3` | `#8C8C8C` | Third cut, then the cycle repeats |
| Caption | `--caption` | `#F5F5F5` outline | Caption blocks, drawn as an outline with no fill |
| Voice and music fill | `--voice` / `--music` | `#2E2E2E` | Source audio and music bed, with secondary text |
| Playhead | `--playhead` | `#FFFFFF` | Playhead line in the timeline, source strip, and player |

Cuts are told apart by lightness, not hue. The timeline reads as black and white.

### Status (status only, never decoration)

| Role | Token | Hex |
|---|---|---|
| Success | `--success` | `#4ADE80` |
| Warning | `--warning` | `#FACC15` |
| Danger | `--danger` | `#F87171` |

### Adjustments from the draft

Three values changed from the first draft so text passes contrast checks (`tests/theme-contrast.test.ts`):

- **Cut 3** is `#8C8C8C` (was `#6B6B6B`). The dark label on the old value was 3.7:1, below AA.
- **Cut 2** is `#B3B3B3` (was `#A3A3A3`) so it stands apart from cut 3.
- **Secondary** is neutral (`#A3A3A3`). There is no teal or second accent in this theme.

## 4. Typography

- **UI font:** Inter, bundled. Sizes 11 / 12 / 13 / 14 / 16 / 20 / 28 px. Body 13px.
- **Weights:** 400 body, 500 labels and buttons, 600 titles and section labels.
- **Numbers and timecodes:** JetBrains Mono with tabular figures.
- **Section labels:** 11px, 600, uppercase, letter-spaced 0.08em, secondary text colour.

## 5. Spacing, shape, motion

- **Spacing:** 4-point scale (4, 8, 12, 16, 24, 32).
- **Radius:** 6px inputs, 8px buttons, 12px cards, 16px video frame.
- **Elevation:** surfaces are separated by colour. Shadows only on floating menus and the player control bar.
- **Motion:** 120ms hover and focus, 180ms panels. Reduced motion turns all of it off.
- **Mode:** dark only.

## 6. Window

- Native Windows title-bar overlay, so minimise, maximise, close, and Snap Layouts still work.
- A 36px custom title bar on the surface colour: app mark and name on the left, project name in the centre, job status on the right.
- The app mark is greyscale: a white frame with three cuts in the cut greys.

## 7. Components

| Element | Look |
|---|---|
| Primary button | Orange fill, black label. One per view. |
| Secondary button | Surface-1 fill with a border. Hover lifts the border. |
| Ghost button | No fill or border. Secondary text. Hover fills surface-2. |
| Danger | Red text, border on hover only. Never filled. |
| Inputs | 32px, darkest surface, border, orange focus border. |
| Tabs | Secondary text. Active tab is primary text with a 2px orange underline. |
| Selected card | Orange border with a faint orange tint. |
| Badges | AI-selected: orange tint and orange text. Manual and heuristic: neutral outline pill with a dot (white for manual, amber for heuristic). |
| Notices | 3px left edge in the status colour, a faint tint, plain text. |
| Empty states | Dashed border, one sentence, one primary action. |

### Video player

- Custom control bar, shown on hover, focus, or pause. It hides after 2.5s while playing.
- Scrubber: thin grey track, buffered range in grey, played fill in orange, cut ranges in the cut greys, in and out marks as thin white lines, playhead knob in white.
- Keys: Space play and pause, J and L skip 5s, K pause, M mute, F fullscreen, `,` and `.` step one frame.

### Timeline

- Lanes: Video (cuts), Captions, Voice, Music. Lane labels are small uppercase secondary text.
- Cut blocks use the cut greys with black labels. Handles are a darker tint with a grip mark.
- Caption blocks are outlined.
- Playhead: a white line with a shadow edge, so it reads over bright and dark footage.
- Ruler ticks are tertiary text.

## 8. Considered and not adopted

- **B. Mono Lime:** lime highlight on the same greys. Felt more playful than a serious editor needs.
- **C. Paper:** light, cobalt highlight. Would need a second dark theme for editing, which is a larger job.
- **D. Studio Violet:** the earlier violet build. Less monochrome than the brief.
- **E. Warm Graphite:** warm charcoal with coral. Softer than the brief asked for.

## 9. Verification

- `tests/theme-contrast.test.ts` reads `tokens.css` and checks text on every surface at 4.5:1, the label on each highlight fill, and each accent used as text on dark surfaces.
- Re-run after any colour change: `pnpm test`.
