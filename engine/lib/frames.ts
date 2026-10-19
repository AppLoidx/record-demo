export type CapturedFrame = { file: string; t: number };

export type FrameManifest = { frames: CapturedFrame[] };

/** Shortest duration the concat demuxer receives; one 60fps tick. */
const MIN_FRAME_MS = 1_000 / 60;

/**
 * Maps a Chrome screencast timestamp (epoch seconds) onto the storyboard
 * clock (ms since t=0). Frames painted before t=0 map to 0.
 */
export function frameTimeMs(
  timestampSeconds: number | undefined,
  originEpochMs: number,
  receivedAtEpochMs: number,
) {
  const paintedAtMs =
    timestampSeconds === undefined ? receivedAtEpochMs : timestampSeconds * 1_000;
  return Math.max(0, paintedAtMs - originEpochMs);
}

export function parseFrameManifest(source: string): FrameManifest {
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as FrameManifest).frames) ||
    !(value as FrameManifest).frames.every(
      (frame) =>
        typeof frame?.file === "string" &&
        /^[\w.-]+$/.test(frame.file) &&
        typeof frame.t === "number" &&
        Number.isFinite(frame.t),
    )
  ) {
    throw new Error("Invalid frame manifest");
  }
  return value as FrameManifest;
}

/**
 * Builds an ffmpeg concat-demuxer list that holds each frame until the next
 * one was painted. Chrome only sends a frame when the page repaints, so a
 * static stretch is one frame with a long duration. The first frame starts at
 * t=0, the last one holds until the end of the timeline, and frames that share
 * a timestamp keep only the latest paint.
 */
export function buildConcatList(frames: CapturedFrame[], durationMs: number) {
  const ordered = [...frames].sort((a, b) => a.t - b.t);
  const distinct: CapturedFrame[] = [];
  for (const frame of ordered) {
    if (distinct.length > 0 && distinct.at(-1)!.t === frame.t) {
      distinct[distinct.length - 1] = frame;
    } else {
      distinct.push(frame);
    }
  }
  if (distinct.length === 0) {
    throw new Error("The screencast captured no frames");
  }

  const lines: string[] = [];
  distinct.forEach((frame, index) => {
    const start = index === 0 ? 0 : frame.t;
    const end = distinct[index + 1]?.t ?? Math.max(durationMs, frame.t);
    const holdMs = Math.max(MIN_FRAME_MS, end - start);
    lines.push(`file '${frame.file}'`, `duration ${(holdMs / 1_000).toFixed(6)}`);
  });
  // The demuxer ignores the last entry's duration unless the file repeats.
  lines.push(`file '${distinct.at(-1)!.file}'`);
  return `${lines.join("\n")}\n`;
}
