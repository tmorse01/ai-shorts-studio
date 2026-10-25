# AI Shorts Studio: Making shorts with AI

The AI side has two clearly separate steps:

1. **Analyse.** The app *understands* your footage: what's said, where the shots change, and what's on screen. This only adds information (transcript, shots, tags, suggested moments). It never changes your shorts.
2. **Generate shorts.** The app *creates*: it proposes several shorts from a source, each built from a few of its best moments. You review them and keep the ones you like.

A third, script-first path (**Draft with AI** and **Batch**) is covered at the end.

> Status: this describes the target flow from tasks #310 (analysis progress and results), #311 (Generate shorts) and #312 (naming). Until those land, some labels and screens differ, and Generate shorts isn't available yet.

## Before you start

- **Settings → Anthropic API key**: needed for descriptions, suggestions and generation.
- **ElevenLabs key**: optional, for AI narration.
- Transcription runs locally (Parakeet). The model downloads the first time.
- Every AI action shows a **cost estimate** before it runs. Nothing is billed without one.

## Step 1: Analyse a source

1. In **Media**, select one or more video clips.
2. Click **Analyse** (or turn on *Analyse automatically* to analyse every import).
3. While it runs:
   - The tile shows a **progress ring**. Hover it to see the stage: *Transcribing… → Finding shots… → Describing…*
   - The **Analysis** panel lists each clip and its stages. Cancel or retry from there.
4. When it finishes, a summary toast appears, for example:
   > **Analysed bike-run.mp4**: 42 transcript lines · 18 shots · 9 tags · 12 suggested moments
   > [Generate shorts] [Open Clip Finder]

What you now have for that clip:

| Result | Where to see it |
|---|---|
| Transcript (with word timings) | Source viewer → **Transcript** tab. Click a line to jump to it |
| Shot boundaries | Used to snap cuts cleanly. Shown on the source scrubber |
| Tags (e.g. *jump*, *trail*, *forest*) | On the tile and in search and filters |
| Suggested moments | **Clip Finder**, labelled *AI suggested* |
| Summary | Source inspector → **Analysis** section |

Analysing again (**Re-analyse**) refreshes these. Your own moments and shorts are untouched.

## Step 2: Generate shorts from a source

1. Select an analysed clip (or several) and choose **Generate shorts**. It's on the tile, the selection bar, the analysis toast, and Project home's footage section.
2. In the dialog, set:
   - **How many shorts** (default 3)
   - **Target length** (from Project settings, e.g. 30–60s)
   - **Moments per short** (default 4–6)
   - **Angle** (optional), e.g. "the big jumps" or "calm scenic ride"
   - **Avoid reusing moments** across shorts (on by default)
3. Check the cost estimate and click **Generate**. It runs in the background, so you can keep working.
4. The **Review** screen shows one card per proposed short:
   - title and one-line hook
   - total length against the target
   - its moments in order, as thumbnails
5. For each card:
   - **Create** keeps it.
   - **Regenerate** asks for a different take.
   - **Discard** drops it.
   - On a moment: **remove** it, or **swap** it for an alternative.
6. Optional on Create: **Add narration** (voices each hook) and **Add captions**.

Each created short:

- Appears in the shorts grid with a **Draft** badge.
- Has its moments on the **Main** track in order. Each clip is labelled with the moment's name.
- Keeps those moments in Clip Finder (AI origin, accepted), so you can reuse them in other shorts.
- Is one undo step.

From here it's a normal edit: open the short, reorder, trim edges, add music, text or transitions, then **Export**.

## Hands-on alternative: Clip Finder

If you'd rather build the short yourself:

1. Open **Clip Finder** from the left rail.
2. Browse **Suggested / Highlights / Topics**, or filter by **Mine / AI suggested / Starred**.
3. For each candidate:
   - **▶** previews it.
   - **Accept** turns an AI draft into a moment.
   - **+** adds it to the open short's timeline.

## Script-first path (optional)

Use this when you want narration to drive the edit.

1. **Project home → Scripts → Draft with AI**: give a topic, count, length and tone. Claude writes scripts grounded in your transcripts and shots.
2. Edit the lines, or rewrite one (shorter, longer, punchier).
3. **Assemble**: the AI picks footage for each line. **Review** it, then **Apply** (one undo step).
4. **Swap** alternatives, **Lock** cuts you like, and **Re-assemble** a single line.
5. **Make narration** and **Make captions** from the script.
6. **Batch…** does this for many shorts at once: approve the scripts, then **Assemble approved**, then review each one.

## Tips

- Analyse once, generate many times. Generation reuses the analysis, so it's quick and cheap.
- Use **Angle** to get different flavours from the same footage.
- Lock the cuts you love before regenerating or re-assembling.
