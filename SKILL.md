---
name: record-demo
model: claude-opus-5-5
description: Record a scripted screen-capture demo of any live website with Playwright, then render cursor, zoom, spotlight, captions, and GIF outputs with Remotion. Use when asked to record, script, re-record, or fix a website walkthrough, how-to clip, product demo, storyboard, timeline, caption, cursor, zoom, or Remotion/Playwright demo video.
---

# Record demo videos

## Role and bar

You are the senior motion designer on this clip. The bar is an Apple-level product video:
premium, calm, deliberate. A take ships only when every line below holds; otherwise
re-pace and re-record.

- **Real product, real artifacts.** Real app screens, real templates (emails, pages)
  rendered with demo data. Never a look-alike.
- **One thing moves at a time**, and every move lands before the next starts (see
  Choreography).
- **Compositions are centered and intentional.** Re-frame after every layout change; never
  leave a stale zoom on a new page.
- **Type is designed, not dropped in.** Chapter cards and captions use the kinetic
  entrances; text never sits on top of busy UI.
- **Emphasis adds meaning.** Callouts and highlights only for information not already on
  screen; highlights are soft filled areas with inner space, never thin outlines.
- **Actions feel real.** Loading and disabled states are visible after every submit; nothing
  vanishes the instant it is clicked.
- **Unhurried pacing.** Give each result a beat to read; a slightly longer clip beats a
  rushed one.

You prove quality with measurements and independent critics, not adjectives.

## Quality process

**1. Reference -> numbers.** Read the reference frame by frame and turn it into numbers: cut
rhythm, camera speeds, the hero motion curve, type size and timing, stage colour. Those
numbers are the bar. Measure it, never copy it.

**2. Storyboard first.** One table before any capture:

| Time | Shot | What it proves | Cut out |
|---|---|---|---|

Keep shots short - aim for 2-3 s; a longer shot is fine when an action needs it (typing,
a loading state). Total length follows the content; a full flow can run well past 25 s.
Frame 0 is already the money shot.

**3. Build rules.**
- One seek clock: every pixel is a pure function of time. Overlays derive from the frame
  number only - no state, `Date`, or randomness (Remotion compositions already work this way).
- Build every element (each overlay, each shot, the type) alone in its own lab before it
  joins the film: its own composition or proof render, checked frame by frame.
- Overlays and type are code; the screen here is a real capture. Every threshold is a
  crossfade - hard switches flash for a frame.

**4. Critic loop.**
- Builder and critic are always separate agents. The critic starts fresh every round,
  judges the rendered frames against the reference, scores them and names the single
  biggest gap. The builder fixes only that.
- Blind test: mix your frames with the reference's. If a judge can tell which is which, it
  is not done.
- Wow gate: split the film into 3 s windows. Every one must be a yes.

**5. Sound.** One real track, lined up so its own final hit lands on the end card and
played as one continuous piece; cut on its beat. A clean, real sound on every small move,
with the hero moments clearly audible. Not supported yet: the engine renders muted, and the
track must come from the user (licensing). Until then, ship silent and say so.

**6. Measure, then watch like the client.** Render at 60 fps and measure:

```bash
ffmpeg -i out/<name>-16x9.mp4 -vf freezedetect=n=0.001:d=0.5 -an -f null - 2>&1 | grep freeze_   # frozen frames
ffmpeg -i out/<name>-16x9.mp4 -vf blackdetect=d=0.05:pix_th=0.10 -an -f null - 2>&1 | grep black_  # black frames
ffmpeg -i out/<name>-16x9.mp4 -af ebur128 -f null - 2>&1 | tail -12                                 # loudness (when audio exists)
```

One-frame pops: compare adjacent frames in the frame sheets and at every transition boundary
(the engine tests enforce continuity; the render must too). Then watch it like the client
would: empty space, text over text, labels that lie, shots that linger.

## How it works

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

Require Node >= 22.18 (nvm or system), `ffmpeg`, `Xvfb`, and `xdpyinfo`. Install
dependencies once inside `engine/` with `pnpm install`.

```bash
node <skill-dir>/engine/record.mjs \
  --script /absolute/or/cwd-relative/demo.demo.ts \
  --url https://example.org \
  [--name output-slug] [--formats 16x9,1x1,9x16] \
  [--chrome none|macos|browser] [--storage-state <path>] [--raw]
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

## Authenticated sites

Record authenticated flows only with staging or test accounts; never use production
credentials. The agent should first log in once with its own tooling, using a headless
Playwright script. If sign-in requires an emailed OTP or magic link, the preferred
route is the agent's own mail access - a connected Gmail connector/MCP on Claude Code,
or a mail CLI on other runtimes - so it reads the code itself; otherwise ask the user
to paste it. After login, save the session with
`await context.storageState({ path: storageStatePath })`, where `storageStatePath`
is a one-shot temporary path created as
`storageStatePath="$(mktemp -d)/<account>.storage-state.json"`. Then run the
recording command with `--storage-state "$storageStatePath"`.

Playwright `storageState` restores cookies and localStorage only. Apps that keep auth
in IndexedDB or sessionStorage will silently record a logged-out screen, so verify the
authenticated page before capturing. The storage-state file is a secret: never print
or commit it. The recorder deletes it immediately after loading it; it is a one-shot
handoff, so re-recording requires a fresh login and nothing auth-related is left on
disk. The one-off login helper script also holds credentials: keep it temporary and
never commit it.

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

## Multi-actor stories: windows, transitions, roles

For flows that cross people or apps (customer app -> email -> ops tool), three effects
keep the clip legible:

| Effect | Storyboard | Use for |
|---|---|---|
| Second window | `await d.window({ html } \| { url }, { title, holdMs, highlight, click })` | An email, notification or second app rising over the screen; `highlight` + `click` sends a cursor to that element |
| Scene transition | `await d.transition(label, async (page) => { ...switch... }, { role })` | Masking a switch between apps or a slow page load; the action runs while the label card shows |
| Role badge | `d.role("Customer")`, or `role` on a transition | Naming whose perspective is on screen |

- Window content must be the real artifact: render the product's own template (for example
  the real email renderer with demo inputs). Never hand-write a look-alike.
- Do slow, ugly work (page loads, prefilling a long form, resetting mock state) inside a
  transition action, not on camera.
- Transitions reset the camera to wide; do not `zoomOut()` right before one.
- `d.callout(locator, text)` only when the label adds something not already on screen (the
  outcome, a consequence). Never restate visible UI text ("Merchant replied" next to a
  "Merchant replied" badge) or announce what the next scene shows anyway; one or two per
  clip is plenty.
- Mocked backends answer instantly, so real loading states flash by. Add realistic latency
  (~1s on submits) in the mock or a `context.route` delay so the product's own spinners and
  disabled states show; never draw a fake loader.

## Recording local apps (dev servers, mocks)

- **Warm every route in `seed`** (visit each URL once, `waitForLoadState("load")` plus about
  1s). Cold dev-server compiles during capture stall the screen. Never wait on
  `networkidle`: dev servers keep sockets open and each wait burns 30s of the 300s test budget.
- **Rename on-screen fixture names at the data source** (the mock fixtures), not by editing
  DOM text. A MutationObserver text rewrite causes hydration mismatches and breaks
  interactive widgets (observed: a file upload silently ignored files).
- **Dev-mode widgets hydrate late.** Retry setting a file on `input[type=file]` until the
  file chip shows, rather than trusting one `setInputFiles` right after load.

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
  credentials on screen. Prefer renaming at the data source; a seed-time DOM rewrite
  (window.open patch, MutationObserver) is only safe on static or non-hydrated pages.

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
5. **Review every move as a frame sheet**: `node scripts/frame-sheets.mjs <name>` writes one
   contact sheet per zoom, spotlight, window, transition and outro to `out/sheets/` (12 frames at 8fps spanning
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
| Cursor offset ~174px vertically | Chrome ran tabbed, not `--app`. |
| Could not find clapperboard frames | Detector tolerance is 64 (external captures average impure); if it still misses, check the capture isn't black (Chrome on wrong DISPLAY). |
| Captions/cursor land over the wrong screen after ~30s (WSL) | The VM wall clock steps ahead ~2.5s every ~32s; the runner removes these steps from capture timing (log line "Clock step at master ..."). If drift persists, compare frames against timeline events before blaming the storyboard. |
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
