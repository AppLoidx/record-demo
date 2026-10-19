# CDP screencast capture: record any site on any OS

## Goal

Anyone with Node and an agent can record a demo of any website, on macOS, Windows or
Linux, including sites behind a login. The agent still drives the browser from a
storyboard. Getting a logged-in session is the user's job; the engine only accepts one.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Capture | Chrome DevTools Protocol `Page.startScreencast`, one backend | Xvfb + x11grab is Linux-only. Spike (2026-10-19): 2880x1620 at ~57-60fps during motion, max gap 34ms while scrolling, headless |
| Xvfb path | Deleted, with the clapperboard | One capture path to maintain. Frame timestamps replace flash detection |
| Sync | Chrome frame timestamps (epoch seconds) mapped onto the storyboard clock | Same machine clock; no sentinel frames, no trim search |
| Pixel density | Viewport 1920x1080, `deviceScaleFactor: 1.5`, plus `--force-device-scale-factor=1.5` | Without the flag, screencast frames come out at CSS size (1920x1080). With both, frames are 2880x1620 and the page sees DPR 1.5 |
| Headless | Default headless; `--headed` to watch | No display server needed |
| Encoding | Remotion's bundled ffmpeg (`remotion ffmpeg`), JPEGs piped per 60fps tick | Drops the system ffmpeg requirement. Picking the frame per tick in JS anchors every frame to its own time; a concat list with per-frame durations accumulated jitter into drift and cut the final static stretch |
| Stripped ffmpeg | No `fps`, `tile`, `drawtext` or lavfi sources in the bundled build | GIF resamples with output `-r`; frame sheets are laid out in Chromium; the composition proof loops a Chromium-painted pattern |
| Capture fps | 60 (was 30) | Screencast delivers 60 in motion |
| Session | `--storage-state` (unchanged one-shot) or new `--profile <dir>` (+ `--channel`), never both | Login is out of scope. A profile covers IndexedDB, sessionStorage, SSO and passkeys, which storage state cannot. Playwright launches with its own cookie key (`--use-mock-keychain`, `--password-store=basic`), so the profile must be created with `playwright open --user-data-dir` and the same `--channel` |
| Clock | Storyboard events and frames both on the wall clock (`Date.now`) | A clock step during a take moves both together |

## Capture data flow

1. Storyboard `ensureStarted()` sets t=0 (`Date.now()`) and starts the screencast on the active page.
2. Each `Page.screencastFrame` is written to `out/.frames-<name>/NNNNNN.jpg` (JPEG q92), acked, and its timestamp converted to ms since t=0.
3. `activatePage` / `closeActivePage` stop the screencast on the old page and start it on the new one.
4. A repaint nudge after each attach guarantees a first frame (Chrome only emits frames on repaint).
5. `writeTimeline()` stops the screencast and writes `out/<name>-frames.json`: `{ frames: [{ file, t }] }`.
6. `lib/encode-screencast.mjs` checks the first frame is 2880x1620, picks the latest paint at or before every 60fps tick up to `durationMs`, and pipes those JPEGs to ffmpeg (`image2pipe`) to encode `<name>-trimmed-master.mp4`. Frames before t=0 collapse into the first frame. The frames directory and manifest are registered for cleanup before Playwright starts, so failed takes leave no screenshots behind.
7. Raw deliverable, Remotion renders and GIF are unchanged.

## Removed

`lib/clapperboard.ts`, its test, Xvfb/xdpyinfo/x11grab code in `record.mjs`, `CLAPPERBOARD_COLOR`,
`flashClapperboard`, the `--app` window flags. `timeline.capture.syncFlashAt` stays in the schema
(always 0) so existing exported projects and fixtures still parse.

## Not in this change

- Masking live data on screen (a `d.mask()` DSL helper). The existing seed-level masking still works.
- Restoring IndexedDB from a storage-state file; use `--profile`.
- Verified runs on macOS and Windows; the spike ran on Linux (WSL) only.

## Verification

`pnpm typecheck && pnpm test` in `engine/`. Unit tests cover frame-time mapping, per-tick frame
picking, CLI options and launch arguments; an integration test pipes colored JPEGs through the
bundled ffmpeg and checks the decoded color of every output frame. `scripts/prove-composition.mjs`
and `scripts/frame-sheets.mjs` run on the bundled ffmpeg. No example recordings in this change (owner call).
