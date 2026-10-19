export type CapturedFrame = { file: string; t: number };

export type FrameManifest = { frames: CapturedFrame[] };

/**
 * Maps a Chrome screencast timestamp (epoch seconds) onto the storyboard
 * clock (ms since t=0, same wall clock). Frames painted before t=0 map to 0.
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
 * Picks the frame on screen at every output tick: the latest paint at or
 * before the tick (the first frame covers anything earlier). Chrome only sends
 * a frame when the page repaints, so a static stretch repeats one file, and
 * the last paint holds until the end of the timeline. Every tick is anchored
 * to its own time, so paint jitter never accumulates into drift.
 */
export function framesForTicks(
  frames: CapturedFrame[],
  durationMs: number,
  fps: number,
) {
  const ordered = [...frames].sort((a, b) => a.t - b.t);
  if (ordered.length === 0) {
    throw new Error("The screencast captured no frames");
  }

  const tickCount = Math.max(1, Math.ceil((durationMs / 1_000) * fps));
  const files: string[] = [];
  let current = 0;
  for (let tick = 0; tick < tickCount; tick += 1) {
    const tickMs = (tick * 1_000) / fps;
    while (current + 1 < ordered.length && ordered[current + 1]!.t <= tickMs) {
      current += 1;
    }
    files.push(ordered[current]!.file);
  }
  return files;
}

/** Reads width/height from a baseline or progressive JPEG header. */
export function jpegSize(data: Uint8Array) {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) break;
    const marker = data[offset + 1]!;
    const length = (data[offset + 2]! << 8) | data[offset + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (data[offset + 5]! << 8) | data[offset + 6]!,
        width: (data[offset + 7]! << 8) | data[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
  throw new Error("Could not read JPEG dimensions");
}
