# record-demo

Agent skill + self-contained engine for recording scripted screen-capture demo videos
of any live website: Playwright drives a headed Chrome under Xvfb, ffmpeg captures,
Remotion composites cursor, zoom, spotlight and captions; outputs mp4 (raw + edited
16x9) and GIF.

See SKILL.md for usage. Engine lives in `engine/` (own pnpm workspace; `pnpm install`
once, Node 22, needs `ffmpeg`, `Xvfb`, `xdpyinfo`).

## Install

System dependencies: Node >= 22.18, `ffmpeg` with x11grab support, `Xvfb`,
`xdpyinfo`, and `pnpm`.

For Claude Code:

```bash
git clone <repo> ~/.claude/skills/record-demo
cd ~/.claude/skills/record-demo/engine
pnpm install
```

Claude Code discovers the skill automatically from the `SKILL.md` frontmatter.

For Codex and other agent CLIs:

```bash
git clone <repo> ~/.agents/skills/record-demo
cd ~/.agents/skills/record-demo/engine
pnpm install
```

`~/.agents/skills` is the shared agent-skills directory recognized by Codex, Copilot
CLI, and Gemini CLI.

## Example

A 21-second tour of wikipedia.org - search, suggestion click, article lead, an
focus-dim spotlight on the infobox portrait, and a contents-jump - recorded and
composited entirely by the pipeline (cursor path, zoom, spotlight, captions, end
slate, all driven by the storyboard's timeline). Storyboard:
[engine/scripts/wikipedia-tour.demo.ts](engine/scripts/wikipedia-tour.demo.ts).

![Wikipedia tour demo](media/wikipedia-tour.gif)

Full-quality render: [media/wikipedia-tour-16x9.mp4](media/wikipedia-tour-16x9.mp4)
(2560x1440, 60fps).
