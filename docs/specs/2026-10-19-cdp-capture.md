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
| Encoding | Remotion's bundled ffmpeg (`remotion ffmpeg`) | Drops the system ffmpeg requirement. Concat demuxer with per-frame durations -> 60fps constant frame rate |
| Capture fps | 60 (was 30) | Screencast delivers 60 in motion |
| Session | `--storage-state` (unchanged one-shot), new `--profile <dir>` and `--channel chrome` | Login is out of scope. A profile covers IndexedDB, sessionStorage, SSO and passkeys, which storage state cannot. Chrome encrypts cookies per browser build, so a profile made in Google Chrome needs `--channel chrome` |

## Capture data flow

1. Storyboard `ensureStarted()` sets t=0 (`performance.now()` plus a `Date.now()` anchor) and starts the screencast on the active page.
2. Each `Page.screencastFrame` is written to `out/.frames-<name>/NNNNNN.jpg` (JPEG q92), acked, and its timestamp converted to ms since t=0.
3. `activatePage` / `closeActivePage` stop the screencast on the old page and start it on the new one.
4. A repaint nudge at start and end guarantees a first frame and a closing timestamp (Chrome only emits frames on repaint).
5. `writeTimeline()` stops the screencast and writes `out/<name>-frames.json`: `{ frames: [{ file, t }] }`.
6. `record.mjs` builds a concat list (each frame lasts until the next; the last lasts until `durationMs`) and encodes `<name>-trimmed-master.mp4` at 60fps. Frames before t=0 collapse into the first frame.
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

`pnpm typecheck && pnpm test` in `engine/`. Unit tests cover frame-time mapping, concat-list
building, CLI options and launch arguments. No example recordings in this change (owner call).
