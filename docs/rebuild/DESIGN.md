# Design direction — Galactic Occult / Cinematic Noir

Source of truth for the rebuild's visual design. Supersedes `docs/BRAND.md` (Mono Signal), which
describes the old app on `main`.

> Implementation note: the rebuild uses **Radix primitives + CSS Modules** with centralized CSS
> variables (decided in Epic 01), not Tailwind + shadcn/ui as section 10 originally suggested. The
> rest of this document applies unchanged.

## Objective

Design a premium, dark-themed short-form video editor inspired by the visual identity of **Valve's
Deadlock**, blended with a minimalist **galactic black-and-white aesthetic**.

Reference: https://www.playdeadlock.com/cityneversleeps

The application should feel like a supernatural, cinematic creative studio rather than a typical
SaaS dashboard.

Think **Deadlock's occult Art Deco aesthetic meets a professional video editing workstation, with
the restraint and precision of a monochromatic space-age interface.**

The interface must prioritize usability, editing precision, and content visibility while
maintaining a distinctive visual identity.

## 1. Brand identity

**Theme:** Galactic Occult / Cinematic Noir

Combine three design influences:

- **Deadlock:** Undead sage green, spectral lavender, Art Deco details, supernatural atmosphere,
  vintage editorial typography.
- **Galactic minimalism:** Deep space blacks, crisp whites, subtle celestial textures, high
  contrast, spacious layouts.
- **Professional editing software:** Dense but readable controls, precise timelines,
  keyboard-first interactions, minimal visual distractions.

The result should feel mysterious, sophisticated, cinematic, and highly functional.

Avoid generic AI startup aesthetics, excessive gradients, glassmorphism, neon cyberpunk, and
oversized rounded cards.

## 2. Color system

### Primary palette

| Token | Hex | Usage |
|---|---|---|
| Galactic Black | `#0B0D0C` | Main application background |
| Void Black | `#050606` | Deepest surfaces and video canvas |
| Haunted Charcoal | `#1C211E` | Panels, sidebars, timeline tracks |
| Undead Sage | `#C4DCA5` | Primary actions, active tools, playhead accents |
| Spectral Lavender | `#CBB6E8` | AI tools, generated content, selected effects |
| Galactic White | `#F5F5F0` | Primary text, prominent headings |
| Aged Ivory | `#F0E8D5` | Editorial accents and decorative elements |
| Muted Moss | `#728D71` | Secondary green states |
| Occult Mauve | `#8C719F` | Secondary purple states |
| Subtle Border | `#343B36` | Dividers, panel borders |

### Color distribution

- 65% galactic black and charcoal
- 20% white, ivory, and neutral gray
- 10% undead sage green
- 5% spectral lavender

Black and white define the interface. Green and lavender are intentional accent colors, not
competing backgrounds.

- **Green** — primary editing actions, active playback, selected tools, successful operations.
- **Lavender** — AI-powered features, intelligent suggestions, generated clips, and effects.

## 3. Typography

Three tiers:

- **Display:** Cormorant Garamond or Cinzel — branding, empty states, onboarding, prominent
  editorial headings.
- **Interface headings:** Barlow Condensed — panel names, section headings, tool groups,
  navigation. Prefer uppercase with moderate letter spacing.
- **Functional UI:** Inter — file names, timestamps, buttons, forms, settings, timeline info.

Do not use decorative typography inside precision editing controls. Readability takes priority.

## 4. Application layout

Five main areas.

### Left sidebar — media & tools

A compact vertical workspace: media library, uploaded footage, AI Clip Finder, captions, audio,
transitions, effects, export settings. Monochromatic Lucide icons with subtle green active states.
Narrow and visually restrained.

### Center — video preview

The visual focal point. A near-black canvas with a large 9:16 preview. Includes play/pause,
timecode, aspect ratio selector (9:16, 16:9, 1:1), safe-zone overlay, preview scaling, fullscreen.
Generous negative space around the canvas; very subtle green or lavender ambient light when
appropriate. Never decorative effects that compete with video content.

### Right panel — properties & AI

Context-sensitive inspector.

- Video clip selected: position and scale, crop, duration, playback speed, color adjustments,
  audio levels.
- AI tools selected: a lavender-accented panel with natural-language editing prompt, AI clip
  recommendations, highlight scores, auto-caption configuration, smart reframing, silence removal.

AI should feel integrated into the editor, not bolted on as a separate chatbot.

### Bottom — timeline

A first-class component that feels like professional editing software: time ruler, video
thumbnails, audio waveform, caption tracks, multiple tracks, draggable clips, trim handles, zoom,
snap indicators, playhead, markers.

- Crisp sage-green playhead
- Muted lavender for AI-generated regions and suggested cuts
- White for primary timecode labels

Favor precision, density, and contrast over decoration.

### Top toolbar

Compact header: product logo, project name, save status, undo/redo, keyboard shortcut access,
Export button (sage green with near-black text).

## 5. Component styling

- **Buttons:** Primary = sage background, black text. Secondary = charcoal, white text. AI action =
  lavender, black text. Destructive = muted red. Ghost = transparent with subtle hover. **4px
  radii.** No pills except small status chips.
- **Panels:** Nearly black with thin, understated borders. No heavy shadows. Precision instruments.
- **Inputs:** Dark surfaces, light type, subtle borders. Focus = thin green or lavender outline by
  context.
- **Cards:** Only where separation helps (e.g. AI clip suggestions). The editor is not a grid of
  floating cards.
- **Icons:** Lucide, consistently. Small, sharp, minimal, functional.

## 6. Deadlock-inspired decorative elements

Subtle supernatural Art Deco motifs that never compromise the editor: thin geometric separators,
small diamond ornaments, vintage typography for empty states, faint celestial or occult linework,
delicate green/lavender atmospheric glows, decorative starbursts on onboarding, fine-grain textures
on nonessential backgrounds.

Inspired by Deadlock, not a copy. No official artwork, logos, or proprietary assets.

## 7. Galactic black-and-white influence

Spacious, deliberate, almost monochromatic until something becomes interactive: deep black
negative space, clean white iconography, fine geometric grid lines, subtle orbital patterns, very
faint grain, high-contrast typography, minimal monochrome controls. A futuristic observatory or
high-end cinematic control room. Green and purple are supernatural energy emerging from a
monochrome environment.

## 8. Key screens

- **A. Project dashboard** — spacious gallery, large editorial heading, recent projects, prominent
  Create Project. Each project: thumbnail, title, duration, last modified, aspect ratio.
- **B. Main video editor** — the most important screen. Dense workspace: 9:16 preview, media
  browser, timeline, properties inspector.
- **C. AI clip discovery** — upload a longer video, AI identifies potential shorts: thumbnails,
  start/end, duration, highlight score, short explanation, preview, Add to Timeline. Lavender marks
  AI suggestions.
- **D. Export** — resolution, format, frame rate, quality, filename, render progress. Strong green
  primary Export action.

## 9. Motion & interaction

Deliberate and restrained: 120–180ms hover transitions, 180–250ms panel transitions, subtle green
active illumination, lavender processing indicators, smooth timeline zoom/scroll, minimal page
transitions. No persistent animated backgrounds in the editing workspace. Performance over
decoration.

## 10. Implementation guidelines

React, TypeScript, Lucide icons, centralized CSS variables for the full theme. Customize components
heavily enough that nothing looks stock.

Priorities: 1. editing ergonomics 2. consistent hierarchy 3. contrast and accessibility
4. distinctive identity 5. responsive layouts 6. smooth interactions and performance.

Must feel like a polished, commercially viable creative tool — not a generic admin dashboard. Avoid
excessive cards, needless borders, huge empty panels, and decoration that reduces editing space.
Inspiration: DaVinci Resolve, Premiere Pro, CapCut — with its own identity.

## 11. Final art direction

**Keywords:** Galactic, Occult, Art Deco, Cinematic, Undead, Minimal, Editorial, Precise,
Supernatural, Premium.

**North star:** *A professional video editing suite built inside a supernatural observatory:
near-black workstations, crisp white controls, pale undead-green highlights, soft spectral-purple
intelligence, and just enough vintage occult character to make the product instantly
recognizable.*

Roughly **80% professional editing software, 15% Deadlock-inspired identity, 5% atmospheric
decoration.** Beautiful, but never at the expense of editing usability.
