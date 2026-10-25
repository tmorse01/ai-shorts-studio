# AI Shorts Studio: Getting started

This walks you from an empty app to an exported vertical short. It follows how the rebuild is designed, and some screens may still be rough while it's being tested.

## 0. Before you start

- Run the app: `pnpm install`, then `pnpm dev`.
- Open **Settings** (bottom of the left nav) if you want the AI features:
  - **Anthropic API key**: footage descriptions, suggested moments, scripts and assembly.
  - **ElevenLabs API key**: text-to-speech narration (optional).
  - Keys are stored on your machine with Windows secure storage. AI actions show a cost estimate before they run.
- Transcription runs locally (Parakeet). The model downloads the first time you analyse footage.

## 1. Create a project

1. On the dashboard, click **Create project**.
2. Pick a name and a folder. The project lives in that folder, next to your footage references.
3. Recent projects show on the dashboard as cards. Click one to reopen it.

Projects save automatically. The save status shows in the top bar.

## 2. Add media

1. Open the project and go to **Media** in the left tool rail.
2. Click **Import**, or drag video, audio or image files onto the media panel.
3. The app probes each file, then makes thumbnails, a filmstrip and a 720p **proxy** in the background so editing stays smooth. Originals are never changed, and export always uses them.
4. Use **tags, search and filters** in the media panel to find clips. Music files can be tagged as music.

If you move files on disk, the app marks them offline and offers **Relink**.

## 3. Analyse footage (optional, AI)

1. Select clips and choose **Analyse**.
2. The analysis stages run in the background:
   - transcript (local)
   - shot detection
   - AI visual descriptions (needs an Anthropic key)
3. Open a clip's **Transcript** tab to read and search what was said. Click a line to jump there.
4. Open **Clip Finder** in the left rail to see candidate moments:
   - **Suggested / Highlights / Topics** tabs.
   - AI suggestions are labelled **AI suggested** and stay **Draft** until you accept, edit or dismiss them.
   - Star a candidate to favourite it, and use the **Starred** filter to find it again.

## 4. Mark moments yourself

1. Double-click a clip to open it in the **source viewer**.
2. Play it (Space), then press **I** to set In and **O** to set Out.
3. Press **M** to save the range as a **moment** and give it a name.

Moments show up in the media panel and in Clip Finder under **Mine**.

## 5. Create a short

1. On Project home, click **New short**. It appears as an empty "Short N" in the 9:16 grid.
2. Open it. The editor has:
   - **Left:** the tool rail (Media, Clip Finder, Text, Audio, Transitions, Captions) and its panel.
   - **Centre:** the 9:16 preview.
   - **Right:** the inspector.
   - **Bottom:** the timeline.
3. Switch between shorts from the dropdown in the top bar.
4. Defaults such as target length and platform come from **Project settings**. Override them for one short in the inspector, with nothing selected on the timeline.

## 6. Build the cut on the timeline

- **Add clips:** drag a moment, clip or marked range onto the **Main** track. Dropping between clips inserts there and pushes later clips right.
- **Reorder:** drag a clip along Main.
- **Trim:** drag a clip's left or right edge. The preview shows the edge frame while you drag.
- **B-roll:** add an overlay track (**Add track**) and drop clips above Main.
- **Split:** press **S** at the playhead.
- **Delete:** press **Delete**. This leaves a gap. Select the gap and press Delete, or use **Close gap**.
- **Snapping:** press **N** to toggle it. Hold **Alt** to ignore it while you drag.
- **Transitions:** use the clip menu at a cut for **Crossfade**, **Dip to black**, **Whip** or **Zoom**. Drag the transition's edge to change its length.
- **Zoom:** Ctrl + mouse wheel. **Fit** shows the whole short.
- The shaded band on the ruler shows the short's target length (for example 30–60s).

Every edit is undoable: Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo.

## 7. Frame it for vertical

Select a clip, then use the preview:

- **Drag and scale** the video to choose the 9:16 crop.
- In the inspector's **Framing** section, pick **Fill** (crop) or **Fit with blurred background**.
- **Set end framing** adds a slow pan across the cut.
- New cuts reuse the last framing you used on that source.

Turn on **safe zones** in the preview to keep things clear of platform UI.

## 8. Narration

From **Audio → Narration**:

- **Record:** pick a mic, then record from the playhead.
- **Import:** drop an audio file onto the Narration lane.
- **Text-to-speech:** if a script is attached, generate or regenerate each line with a chosen voice (needs an ElevenLabs key).

## 9. Captions

1. Go to **Captions → Generate**, from the narration or from the source speech under each cut.
2. Captions default to 3 words per block and highlight word by word.
3. Double-click a caption to edit its text. Drag or trim blocks on the Captions lane. You can split and merge blocks.
4. Pick or edit a **style preset** in the inspector. Presets are shared across the project.
5. Export an **SRT** if you need a subtitle file.

## 10. Music, text and overlays

- **Music:** drop a music file onto the Music lane.
  - **Loop to fill** covers the whole short.
  - **Auto-ducking** lowers the music under narration. Tune the amount, attack and release in the inspector.
- **Text:** add a title preset (title card, lower third, call to action) from the **Text** panel. Edit it on the canvas, and give it an entry or exit animation (fade, slide, pop, typewriter).
- **Images:** drop a logo or sticker onto an overlay track and position it on the canvas.

## 11. Scripts and AI assembly (optional)

1. Go to **Project home → Scripts → Generate**. Give a topic, count, length and tone, review the cost estimate, and get draft scripts. Edit the lines, or rewrite one (shorter, longer, punchier).
2. Attach a script to a short, or create a short from it.
3. **Assemble:** the AI proposes cuts for each line. Review the plan and accept or reject each line, then **Apply** (one undo step).
4. Afterwards:
   - **Swap** a cut for one of its alternatives.
   - **Lock** cuts you want to keep.
   - **Re-assemble** a single line.

## 12. Make many shorts at once (batch)

1. Choose **Batch**. Set a prompt, how many shorts, the length, and whether to avoid reusing footage. Check the estimate.
2. **Approve** the generated scripts (edit or regenerate any of them), then **Assemble approved**.
3. Review each plan. Applied drafts show a **Draft** badge in the shorts grid: keep, discard or regenerate them.

## 13. Export

1. Click **Export** (top right) for the current short, or **Export all Ready** from the shorts grid.
2. Choose:
   - a preset: TikTok / Reels / YouTube Shorts (1080×1920, 30 or 60 fps)
   - quality
   - whether to include captions
   - the filename
3. Check the estimated size and time, then click **Export video**.
4. The **render queue** shows progress. Use it to cancel, or to open the output folder when the render is done.

Export renders from your original files. If hardware encoding is available (NVENC/QSV/AMF) it's used, otherwise the app falls back to x264. A pre-flight check warns you about offline media, empty shorts or going over the target length.

## Shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Step one frame |
| I / O | Set In / Out (source viewer) |
| M | Save moment |
| S | Split at playhead |
| N | Toggle snapping |
| Delete | Delete (leaves a gap) |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl + wheel | Zoom the timeline |
| ? | Shortcut list |
