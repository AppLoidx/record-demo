---
name: record-demo
description: Record a scripted screen-capture demo of any live website with Playwright, then render cursor, zoom, spotlight, captions, and GIF outputs with Remotion. Use when asked to record, script, re-record, or fix a website walkthrough, how-to clip, product demo, storyboard, timeline, caption, cursor, zoom, or Remotion/Playwright demo video.
---

# Record demo videos

Write an ad-hoc Playwright storyboard, then run the self-contained engine from any cwd.
Do not add the storyboard to an application repo unless the user asks for that.
Keep the storyboard self-contained; the runner stages that file inside the engine before
Playwright loads it, so do not use storyboard-relative helper imports.

## Write the storyboard

Import the DSL with this exact absolute import:

```ts
import { demo } from "/home/bbx/.claude/skills/record-demo/engine/lib/storyboard";
```

Use `engine/scripts/example-site.demo.ts` as the reference. Prefer `getByRole` selectors,
use `d.click(locator)` instead of `locator.click()`, pace actions with `d.hold(...)`, and
assert or wait for the final state.

```ts
demo("storyboard-title", async (d) => {
  await d.seed(async (page) => {
    await page.getByRole("heading", { name: "Example Domain" }).waitFor();
  });

  await d.step("Read the page", async (page) => {
    const heading = page.getByRole("heading", { name: "Example Domain" });
    await d.zoomTo(heading, { padding: 48 });
    await d.hold(2_000);
    d.zoomOut();
    await heading.waitFor({ state: "visible" });
  });
});
```

The engine overrides the timeline name with `--name` or the script basename, so the
string passed to `demo(...)` does not need to match the output slug.

## Record

Require Node 22, `ffmpeg`, `Xvfb`, and `xdpyinfo`. Install dependencies once inside
`engine/` with `pnpm install`.

```bash
. ~/.nvm/nvm.sh && nvm use 22.22.2
node /home/bbx/.claude/skills/record-demo/engine/record.mjs \
  --script /absolute/or/cwd-relative/demo.demo.ts \
  --url https://example.org \
  [--name output-slug] [--formats 16x9,1x1,9x16] \
  [--chrome none|macos|browser] [--raw]
```

Use `--formats` to select one or more composition presets (default `16x9`) and
`--chrome` to choose the rendered window frame (default `none`). Formats render in
the requested order, and the first is the primary used to encode the GIF.
The `9x16` format is an aggressive center crop (about 44% of the page width is visible in the wide shot), so keep the action centered when authoring for portrait.

Use `--raw` to stop after the clean capture. Without it, expect these deliverables:

- `engine/out/<name>-raw.mp4`
- `engine/out/<name>-<format>.mp4` for every requested format
- `engine/out/<name>.gif` encoded from the primary format

The runner prints absolute deliverable paths when it finishes. Treat live-site
reproducibility as the target site's responsibility and never embed real credentials in
a storyboard.

## Edit a recorded demo in Remotion Studio

Export a self-contained project after recording, then install and open Studio:

```bash
node /home/bbx/.claude/skills/record-demo/engine/scripts/export-project.mjs <name>
cd /home/bbx/.claude/skills/record-demo/engine/out/<name>-project
pnpm install
pnpm studio
```

Studio's timeline panel shows editor-style tracks (Screen filmstrip, one named clip per
caption, spotlight, zoom move, and outro) - drag the playhead to scrub, click a clip's
row to find its event. Use the props panel or `fixtures/timeline.json` to edit captions,
zoom timing (keep zoom moves at or above the 1650ms floor), spotlight timing, and the
outro title. Edit
`remotion/theme.ts` for colors, typography, spacing, and motion. Render the finished
16:9 video with `pnpm render`.

## Motion and storyboard rules (what makes a clip postable)

- **One camera move per scene, not per field.** Zoom once to the section, act inside it.
  Per-input zooms read as edgy cuts.
- **Land wide through page transitions, stay wide on sparse pages.** `d.zoomOut()`
  BEFORE a click that navigates; never zoom to a status pill on a near-empty page.
- **Sections near the page bottom:** `d.zoomTo([...locators], { scroll: "center", padding: 48 })`
  - the camera clamp cannot center a page-edge rect; scroll-centering fixes it at the
  root. `Locator[]` frames a whole section via union bbox.
- **`d.spotlight([...locators])`** = Apple-style focus dim (cutout + ring). Generous
  `holdMs`, end explicitly with `d.spotlightOff()` + `hold(600)` before the step ends.
  Spotlight rects must fit the viewport (enforced); zoom rects may overflow by design.
- **Seed waits for real data**, not just the trigger element - otherwise the video opens
  on a skeleton. Wait for a known content node + ~600ms.
- **`d.settle(locator)` before outcome captions.** Views that re-fetch after a submit
  blank briefly; a plain `waitFor` resolves on the first paint and the outcome caption
  fires over a white page.
- **Captions are imperatives** tied to the cursor action; put an outcome caption
  (`d.caption(...)` late in the step) on closing scenes; trim step captions so
  imperatives never hang over completed actions.
- **`d.outro(title)` closes postable clips** with a calm end slate after the final
  scene.
- **Always assert the end state** - without it the pipeline renders a polished video of
  a broken flow.
- Never ship a clip with a localhost URL, internal hostname, provider name, or real
  credentials on screen. Mask presentation-only strings in the seed (window.open patch and a
  MutationObserver input rewrite).

## Verify before reporting done

1. `pnpm typecheck && pnpm test` in `engine/`.
2. `node scripts/score-motion.mjs out/timeline.json` - FAIL blocks; WARN zoom-rate
   ~0.78/s is the accepted steady state; any discontinuity verdict is a camera bug;
   dead-air WARNs mean a static stretch >= 3.5s with under 40px of cursor travel -
   re-pace or caption it.
3. `node scripts/prove-composition.mjs` after engine changes.
4. **Watch the actual render**: `ffmpeg -i out/<name>-16x9.mp4 -vf fps=1 out/frames/%03d.png`
   and read the frames. Zoom clipping, caption lag, cutout desync and on-screen dev URLs
   are invisible in a green test run.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `Invalid demo viewport ...` abort | Geometry drifted - fix launch flags, never relax the assertion. |
| Cursor offset ~174px vertically | Chrome ran tabbed, not `--app`. |
| Could not find clapperboard frames | Detector tolerance is 64 (external captures average impure); if it still misses, check the capture isn't black (Chrome on wrong DISPLAY). |
| Captions/cursor drift over the clip | Clapperboard sync - don't wall-clock subtract. |
| Spotlight cutout off its target | Rect raced a smooth scroll - measureTarget's stability loop should hold; if it recurs, raise its timeout. |
| Words cut mid-letter at crop edge | `zoomTo(locator, { padding: 120 })` for modals. |
| Zoom clips content off-frame | `maximumScale` taste issue (1.45 works), not a clamp bug. |

## Verify engine changes

Run from `engine/`:

```bash
pnpm typecheck && pnpm test
node scripts/prove-composition.mjs
```
