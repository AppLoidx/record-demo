# record-demo

Agent skill + self-contained engine for recording scripted screen-capture demo videos
of any live website: Playwright drives a headed Chrome under Xvfb, ffmpeg captures,
Remotion composites cursor, zoom, spotlight and captions; outputs mp4 (raw + edited
16x9) and GIF.

See SKILL.md for usage. Engine lives in `engine/` (own pnpm workspace; `pnpm install`
once, Node 22, needs `ffmpeg`, `Xvfb`, `xdpyinfo`).
