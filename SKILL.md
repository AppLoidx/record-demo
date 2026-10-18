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
  judges the rendered frames against the reference, scores them, names the biggest gap
  and ranks every other finding. The builder fixes all of them in the next take (biggest
  first) and keeps a running list of recurring issues so none re-surfaces. Fixing one gap
  per take stalls: each fresh critic names a new top gap while the rest keep dragging
  every take down.
- Blind test: mix your frames with the reference's. If a judge can tell which is which, it
  is not done.
- Wow gate: split the film into 3 s windows. Every one must be a yes.

**5. Sound.** You cannot hear: measure everything, never judge by feel. Install `ffmpeg`
and `librosa` first if missing. The engine renders muted, so sound is an `ffmpeg` pass on
the exported MP4.

- **Music.** Only a track the user supplies, or one under the free Mixkit license. State the
  source and license. Never generate music or sound effects programmatically. When the music
  must have no voice, prove it: split with Demucs (`python -m demucs --two-stems=vocals`) and
  require the vocal stem about 30 dB or more below the instruments, outside silent passages
  (Mixkit lists no vocals field).
- **Beat grid.** Detect beats with `librosa`. It sometimes locks onto off-beats: plot the
  waveform below 120 Hz, overlay the beat grid, zoom into a few bars. If kick drums miss the
  grid, shift the whole grid.
- **Sync.** Put major moves (scene changes, titles) on beats. Change the animation timing if
  you can; otherwise shift where the music starts. Let the track's own final hit land on the
  end card, played as one continuous piece.
- **Effects.** One real, pre-made file per scene change and per meaningful move: whoosh for
  motion, pop for elements appearing, click for presses, keyboard for typing. Source order:
  1. The project's own sound library (for example the one shipped with HyperFrames).
  2. Otherwise Openverse (`https://api.openverse.org`), only results with
     `license=cc0,by,pdm` and `source=freesound,jamendo`. One search per sound type
     (anonymous limit: 200 searches a day). Pick the best fit for the action in each
     frame, `curl` the file by its URL into `sfx/`, and copy each result's `attribution`
     field verbatim into `credits.txt`.
  3. Nothing fits: ask the user.
- **Levels.** Voice-over (if any) loudest, with music ducked under speech; effects louder
  than music. Target about -16 LUFS integrated and true peak below -4 dBFS, so AAC and mono
  phone speakers do not clip. Measure the exported MP4 with `ffmpeg`'s `ebur128` filter,
  never the WAV.
- **Proof.** For every effect cue, extract one frame before and after it from the exported
  MP4 with `ffmpeg` and plot the waveform next to them. Then give the user five timestamps
  to check on headphones. Never claim the sound is good.

Run the measured post-render pass with supplied music and `whoosh.mp3`, `pop.mp3`,
`click.mp3`, `typing.mp3` plus verbatim attributions in `<sfx-dir>/credits.txt`:

```bash
node engine/scripts/add-sound.mjs --video <export.mp4> --timeline <timeline.json> \
  --music <instrumental.mp3> --music-credit "<title, artist, source, license>" \
  --sfx-dir <sfx-dir> --music-offset auto --out out/sound-pass/demo.mp4
```

Uses `AUDIO_PYTHON` (default `/home/bbx/.venvs/audio/bin/python`) with librosa,
matplotlib, scipy and soundfile. `d.type()` records typing spans; for old timelines,
pass `--typing "start-end,start-end"` in **timeline seconds** (textbox click to next
zoom). Cues are mapped through hidden cuts into composition time; nearby discrete
cues prefer whoosh, then pop, then click. `--music-offset <seconds>` overrides auto.
Auto keeps the detected final strong low-band attack within the end card and
minimizes major-cue beat error; the continuous slice fades to the video end. Final
attack detection is a heuristic: inspect the beat grid and cue errors, then listen.
Alongside the output are `cues.json`, `beats.json`, `beat-grid.png`, `credits.txt`,
exported AAC loudness measurements, `proof/` cue frames/waveforms/contact sheets and
`headphones.txt`. The command copies the video stream and fails unless exported
I is -17..-15 LUFS and true peak is below -4 dBFS. Listen at the five timestamps;
passing measurements do not establish sound quality.

**6. Measure, then watch like the client.** Render at 60 fps and measure:

```bash
ffmpeg -i out/<name>-16x9.mp4 -vf freezedetect=n=0.001:d=0.5 -an -f null - 2>&1 | grep freeze_   # frozen frames
ffmpeg -i out/<name>-16x9.mp4 -vf blackdetect=d=0.05:pix_th=0.10 -an -f null - 2>&1 | grep black_  # black frames
ffmpeg -i out/<name>-16x9.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12                       # loudness + true peak (exported MP4)
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

For flows that cross people or apps (customer app -> email -> ops tool), these effects
keep the clip legible:

| Effect | Storyboard | Use for |
|---|---|---|
| Second window | `await d.window({ html } \| { url }, { title, holdMs, highlight, click })` | An email, notification or second app rising over the screen; `highlight` + `click` sends a cursor to that element |
| Card-less cut | `await d.cut(async (page) => { ...switch and wait for settled UI... }, { visibleMs: 540 })` | Preferred scene change when the loop rail is shown: a short dissolve, no chapter card; all action time is removed |
| Scene transition | `await d.transition(label, async (page) => { ...switch... }, { role })` | Masking a switch between apps or a slow page load; the action runs while the label card shows |
| Role badge | `d.role("Customer")`, or `role` on a transition | Naming whose perspective is on screen |
| Loop rail | `d.rail(["Bank", "Ops", "Customer", "Ops", "Bank"], 0)` | A persistent actor path; repeat with the next active index to advance |
| Return arc | `d.railBack(3, 2)`, `d.railOff()` | Showing a loop back, then hiding the rail when the story ends |
| Message carry | `await d.carry(source, "Please revise this answer")`; transition; `await d.land(destination)` | Carrying the same words across a cut or chapter into the next app |

- The rail replaces the role badge while visible and stays above chapter cards. Indices
  start at 0; allow 520ms for an advance, or 1720ms for a return arc, landing and fade.
- Carry/land locators should frame the message text. Author the sequence as:
  **carry at submit → cut/transition → land → railBack → caption**. For example:

  ```ts
  await d.carry(sourceText, message);
  await d.click(submitButton);
  await d.cut(async (page) => {
    await page.goto(customerUrl);
    await d.settle(destinationText);
    // Scroll and any destination zoom must settle inside this action.
  });
  await d.land(destinationText, { text: message });
  d.railBack(3, 2);
  await d.hold(1720);
  d.caption("Review the updated answer");
  ```

  Carry lifts for 300ms (scale 1→1.04, growing shadow), then holds at that exact position
  above both scene layers through the whole dissolve. Card transitions use the same hold.
  Flight starts only after both the dissolve and the land cue, follows one gently upward-bowed
  700ms arc with the theme camera easing, then reveals the native text over 250ms. There is no
  intermediate landing or resting dock. Awaited `land()` includes flight and reveal (950ms),
  so subsequent rail/caption calls follow them; the engine does not couple those effects.
  The filled, fully rounded pill uses opaque theme accent tint, medium ink, padding and soft
  elevation. Source font metrics are captured at carry; destination Range/font metrics keep
  the final crossfade aligned. Put destination zooms inside the scene-change action and let
  them settle there. A later land cue simply extends the hold; the chip follows the live camera
  during flight/reveal if the camera continues moving. Elastic cards remove hidden load time.

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

- `d.step(text, ...)` captions at its start. When a move must land before its caption (a carry
  landing, a reveal), make the move between steps, then start the captioned step.
- Advance the rail inside the `d.cut` action that shows the new actor, so it moves as the new
  scene resolves rather than ahead of it; after a drawer closes, re-frame first, then advance.
- Land app switches already framed: `zoomTo` inside the cut action plus ~1.8 s of hidden wait;
  the dissolve then reveals a settled shot instead of a wide frame that pushes in.
- Captions name the decision on screen ("The answer is too vague: reject it and say what to
  fix"), one per meaningful click in the step being taught; never restate a visible label.

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
| Recording hits the 300 s Playwright timeout mid-film | A `zoomTo` target vanished after it was checked (e.g. a queue row that moves to another tab once its turn changes); `waitFor` then blocks forever. Frame on stable anchors (headings, tabs, the detail card) and visibility-check every optional part. |
| A drawer opens cropped, then the camera pans late to catch it | Frame the page out to the viewport edge the drawer slides from (inject a 2px `position:fixed` marker there and include it in the framing) so the drawer lands inside the shot. |
| WSL clock steps not corrected (drift of ~2-3 s by mid-film) | Steps vary 1.3-2.5 s; the runner treats any capture gap over 1.2 s as a step. Normal 30 fps spacing is 0.033 s. |
| Two apps show different times or due dates | Force one zone before capture (`newCDPSession(page)` -> `Emulation.setTimezoneOverride {timezoneId:"UTC"}`) and author every mock timestamp in UTC. |
| Mock module fails to load in the recorder (`import.meta` outside a module) | Playwright loads storyboard imports as CommonJS: use absolute paths, not `import.meta.url`. |
| Watching a background recorder: the PID exits instantly | `setsid nohup` leaves a wrapper shell; take the PID of the `node record.mjs` process itself (`pgrep -f '[n]ode record.mjs --script .*<name>' \| tail -1`). |
| Briefs/logs gone after a VM reboot | `/tmp` is wiped; keep briefs and logs in the demo folder. |

## Verify engine changes

Run from `engine/`:

```bash
pnpm typecheck && pnpm test
node scripts/prove-composition.mjs
```

### Card-less scene changes

```ts
await d.carry(sourceText, "Describe the source of funds");
await d.cut(async (page) => {
  await page.goto(customerUrl);
  await d.settle(page.getByText("Describe the source of funds", { exact: true }));
  await d.zoomTo(destinationSection);
  await d.hold(1800);
});
await d.land(destinationText);
```

`cut` defaults to the theme's 540ms dissolve; `visibleMs` must be positive. It resets the incoming
camera wide and freezes the last outgoing screen while the action runs off camera. Wait for the settled
page inside the action. The renderer removes the entire action interval, including slow loads; only the
short dissolve remains. No title, eyebrow, stepper or veil is rendered. The rail and role stay in place
unless explicitly changed by storyboard calls. A rail return finishes by the end of a following dissolve.
Version 1 timelines encode this as a transition with `style: "cut"`, zero outgoing/card presentation time,
and the requested incoming duration. Regular chapter transitions remain available for deliberate section breaks.

### Concealed carry destinations

Use `await d.land(destinationText, { conceal?: boolean, concealColor?: string })` immediately after
`await d.cut(...)` or `await d.transition(...)`. Concealment defaults to true for both styles. The
renderer covers the destination from the first incoming frame until the chip arrives, then crossfades
the chip glyphs into the real text over 250ms while its tint, shadow and the cover fade away.
The pill holds through the scene change, then takes one 700ms arc after the later of dissolve end
and the land cue. Chapter cards do not add an intermediate landing. Material contracts to the exact
line boxes at arrival, preserving adjacent status text when a message wraps.

The cover uses the target's first non-transparent computed background color, walking up its ancestors,
and falls back to the theme surface (white). Supply an opaque `concealColor` to override it,
or `conceal: false` to opt out. Target the exact carried words on a settled page:
the land rectangle is used retrospectively from the incoming frame, so keep the destination geometry
stable during that interval (perform navigation, scrolling and resets inside the scene-change action).
With a pending carry, `land()` never scrolls. An offscreen or moved target raises
"land target moved after the scene change; scroll inside the cut action".
Camera transforms and the incoming screen dissolve apply to the cover automatically. To arrive already
zoomed, issue the destination zoom inside the action and let it settle there before calling land.

When the message is a bare text node inside a status paragraph, select its text explicitly:

```ts
// <p><span>Needs changes</span> · {message}</p>
const { lineCount } = await d.land(statusParagraph, { text: message });
```

`text` selects the first occurrence with visible client geometry across the locator's descendant text
nodes using DOM Ranges; matching collapses whitespace in both the request and DOM text.
The returned `rect` is the union of the measured line boxes; `lines` and `lineCount` are also returned
and recorded on the land event. Wrapped messages land as matching individual lines, with a cover per
line, so the status prefix stays visible even when it lies inside the union rectangle. Empty, missing,
or invisible requested text raises an error instead of using the surrounding paragraph.


### Captions live below the capture

`d.caption(...)` and `d.step(...)` keep their existing API. Any caption event reserves a stage
band for the whole film (6% of frame height in each preset), below the screen frame and its chrome.
The screen fits between that band and the largest authored rail band; late captions and rail changes
do not resize or move it. Films without captions retain their usual frame layout.

Caption text uses medium-weight theme ink directly on the stage gradient, about 30px at 2560×1440,
scaled for compact formats and fitted to the available band when it wraps. Words rise and fade from
the cue itself, with a quick 140ms exit; there is no pill, backing, or empty-shape prelude. Keep captions
short imperatives so they stay easy to read. CaptionLab covers short, wrapped and one-word captions,
plus a rail appearing and disappearing while the bottom action remains clear.
