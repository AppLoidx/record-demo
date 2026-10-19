---
name: record-demo
model: claude-opus-5-5
description: Record a scripted screen-capture demo of any live website with Playwright, then render cursor, zoom, spotlight, captions, and GIF outputs with Remotion. Use when asked to record, script, re-record, or fix a website walkthrough, how-to clip, product demo, storyboard, timeline, caption, cursor, zoom, or Remotion/Playwright demo video.
---

# Record demo videos

Write an ad-hoc Playwright storyboard, then run the self-contained engine from any cwd.
Do not add the storyboard to an application repo unless the user asks for that.
Keep the storyboard self-contained; the runner stages that file inside the engine before
Playwright loads it, so do not use storyboard-relative helper imports.
`<skill-dir>` means the directory where this repository is cloned, for example
`~/.claude/skills/record-demo`.

## Write the storyboard

Import the DSL with this portable import:

```ts
import { demo } from "record-demo/storyboard";
```

The runner rewrites this specifier to the engine's real path when staging, so the
storyboard file can live anywhere. Editor type resolution for
`record-demo/storyboard` comes from `engine/tsconfig.json` `paths` - outside the
repo, map `record-demo/storyboard` to the absolute
`<skill-dir>/engine/lib/storyboard.ts` path in your tsconfig `paths`, or keep the
file in `engine/scripts/`.

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

## Preflight (before any capture)

When recording against a locally served checkout: `git fetch origin` in the serving
checkout and assert `HEAD == origin/main` (or the user-named branch) — a stale checkout
records a stale design. If stale, rebuild/restart the
server first. Print the serving SHA into the take notes so every recording is attributable.

## Record

Runs on macOS, Windows and Linux. Require Node >= 22.18 and pnpm; install
dependencies once inside `engine/` with `pnpm install` (this also fetches the
browser and a bundled ffmpeg). No display server or system ffmpeg is needed:
Chrome runs headless and hands its own frames to the engine over the DevTools
screencast.

```bash
node <skill-dir>/engine/record.mjs \
  --script /absolute/or/cwd-relative/demo.demo.ts \
  --url https://example.org \
  [--name output-slug] [--formats 16x9,1x1,9x16] \
  [--chrome none|macos|browser] [--raw] [--headed] \
  [--storage-state <path> | --profile <dir> [--channel chrome|msedge]]
```

`--headed` shows the browser window while it records (useful for watching a first
take); the capture is identical either way.

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

## Sites behind a login

Getting a logged-in session is the user's job; the recorder only accepts one. Pick
the account and workspace whose data is fine to show on video, and ask the user
before recording anything that holds real customer data.

| Bring | Flag | Covers |
|---|---|---|
| A Chrome profile the user signed into | `--profile <dir>` (+ `--channel chrome` if Google Chrome created it) | Any login: SSO, OTP, passkeys, IndexedDB and sessionStorage apps. Reused across takes |
| A Playwright storage-state file | `--storage-state <path>` | Cookies + localStorage only. One-shot: deleted right after loading |

**Profile.** Use a dedicated profile directory, never the user's everyday one
(Chrome and Playwright do not support automating the default profile, and a run may change it).
To create one, the user runs Chrome once with
`--user-data-dir=<dir>` (or `pnpm exec playwright open --channel chrome
--user-data-dir <dir> <url>` from `engine/`), signs in, and closes the window. Close
every window using that profile before recording; a locked profile fails to launch.
Chrome encrypts cookies per browser build on macOS and Windows, so a profile made in
installed Google Chrome needs `--channel chrome`, and one made with the bundled
browser needs no channel.

**Storage state.** The user can make one without code: from `engine/`, run
`pnpm exec playwright open --save-storage "$storageStatePath" <url>`, sign in, and
close the window. Use a one-shot temporary path such as
`storageStatePath="$(mktemp -d)/<account>.storage-state.json"`. Scripts can save it
with `await context.storageState({ path: storageStatePath })`. Apps that keep auth
in IndexedDB or sessionStorage record a logged-out screen this way; use a profile.

Both are secrets: never print, commit or upload them. Verify the authenticated page
in the seed (wait for a node only a signed-in user sees) so a logged-out take fails
instead of rendering.

## Edit a recorded demo in Remotion Studio

Export a self-contained project after recording, then install and open Studio:

```bash
node <skill-dir>/engine/scripts/export-project.mjs <name>
cd <skill-dir>/engine/out/<name>-project
pnpm install
pnpm studio
```

Studio's timeline panel shows editor-style tracks (Screen filmstrip, one named clip per
caption, spotlight, zoom move, and outro) - drag the playhead to scrub, click a clip's
row to find its event. Use the props panel or `fixtures/timeline.json` to edit captions,
zoom timing (omit `durationMs` for auto timing; explicit values are floored at 1650ms), spotlight timing, and the
outro title. Edit
`remotion/theme.ts` for colors, typography, spacing, and motion. Render the finished
16:9 video with `pnpm render`.

## Choreography (how a scene is paced)

One thing moves at a time: camera, cursor, or page. Every scene is these beats, in order:

| Beat | Storyboard | Timing |
|---|---|---|
| 1. Frame | `d.zoomTo(section)` or stay wide | Engine picks 1650-2400ms by travel; follow with `d.hold(<= that>)` so the cursor waits for the camera to land (~1.8s for a short move, ~2.4s wide-to-detail) |
| 2. Cue | `d.caption("Imperative")` | Just before the cursor departs |
| 3. Act | `d.click(...)` / `d.type(...)` | Engine paces the cursor by distance and settles 90ms before the click |
| 4. React | `d.settle(result)` + `d.hold(600-900)` | Let the UI response finish on screen before anything else moves |
| 5. Release | `d.zoomOut()` before navigating, or the next scene's Frame | Never in the same instant as a click |

- Omit `durationMs` on `zoomTo`/`zoomOut` - auto timing scales with travel. Pass it only to
  deliberately slow a move (it is floored at 1650ms).
- The camera stays anchored on its target during a zoom and hands off smoothly when a move
  starts before the previous one ends - but an overlapping move still reads busy; pace holds
  so moves land.
- A scene with nothing to Act on (read-only reveal) is Frame + Cue + a hold long enough to
  read the caption (~2s) or a spotlight.

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
4. **Watch the actual render**: `pnpm exec remotion ffmpeg -i out/<name>-16x9.mp4 -vf fps=1 out/frames/%03d.png`
   and read the frames. Zoom clipping, caption lag, cutout desync and on-screen dev URLs
   are invisible in a green test run.
5. **Review every move as a frame sheet**: `node scripts/frame-sheets.mjs <name>` writes one
   contact sheet per zoom, spotlight and outro to `out/sheets/` (12 frames at 8fps spanning
   the move). Read each sheet and check, frame by frame:

   | Check | Fail looks like |
   |---|---|
   | Target anchored | Zoom target slides sideways across tiles instead of growing in place |
   | Smooth speed | Even spacing then a sudden jump, or two near-identical tiles mid-move (stall) |
   | One mover | Cursor travels while the camera is still moving |
   | Clean landing | Last tile shows a skeleton, blank page, or text cut at the crop edge |
   | Caption clear | Caption covers the element being acted on |

   Fix the storyboard pacing (holds, zoom targets, padding) and re-record; report the sheets
   reviewed and what changed.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `Invalid demo viewport ...` abort | Geometry drifted - fix launch flags, never relax the assertion. |
| `The screencast captured no frames` | The page never painted after the first step started; check the seed waits for real content. |
| Raw video frames are 1920x1080 or soft | `--force-device-scale-factor` was dropped from the launch args; frames must be 2880x1620. |
| Logged-out screen with `--profile` | Profile made by another browser build (add or drop `--channel chrome`), or a Chrome window still holds the profile. |
| A stretch of video looks frozen | Expected on a static page: Chrome sends a frame only on repaint, and the last one holds. |
| Captions/cursor drift over the clip | Frame times come from Chrome paint timestamps on the storyboard clock (`lib/frames.ts`); never re-time by frame count. |
| Spotlight cutout off its target | Rect raced a smooth scroll - measureTarget's stability loop should hold; if it recurs, raise its timeout. |
| Words cut mid-letter at crop edge | `zoomTo(locator, { padding: 120 })` for modals. |
| Zoom clips content off-frame | `maximumScale` taste issue (1.45 works), not a clamp bug. |

## Verify engine changes

Run from `engine/`:

```bash
pnpm typecheck && pnpm test
node scripts/prove-composition.mjs
```
