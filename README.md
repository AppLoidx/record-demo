# record-demo

Agent skill + self-contained engine for recording scripted screen-capture demo videos
of any live website: Playwright drives a headed Chrome under Xvfb, ffmpeg captures,
Remotion composites cursor, zoom, spotlight and captions; outputs mp4 (raw + edited
16x9) and GIF.

See SKILL.md for usage. Engine lives in `engine/` (own pnpm workspace; `pnpm install`
once, Node 22, needs `ffmpeg`, `Xvfb`, `xdpyinfo`).

## Example

A 7-second tour of wikipedia.org, recorded and composited entirely by the pipeline
(cursor path, zoom, captions - all driven by the storyboard's timeline):

![Wikipedia tour demo](media/wikipedia-tour.gif)

Full-quality render: [media/wikipedia-tour-16x9.mp4](media/wikipedia-tour-16x9.mp4)
(2560x1440, 60fps).
