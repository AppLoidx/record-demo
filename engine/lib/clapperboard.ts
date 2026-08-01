export type Rgb = readonly [red: number, green: number, blue: number];

export type ClapperboardMatch = {
  frameIndex: number;
  timeMs: number;
  /** Frames in the sentinel run; the first app frame is frameIndex + runLength. */
  runLength: number;
  /** Time of the first frame after the sentinel run — where the render trims. */
  endTimeMs: number;
};

export function findClapperboardFrame(
  frames: Iterable<Rgb>,
  options: { sentinel: Rgb; fps: number; tolerance?: number },
): ClapperboardMatch | null {
  const tolerance = options.tolerance ?? 8;
  let runStart = -1;
  let runLength = 0;
  let frameIndex = 0;

  for (const frame of frames) {
    const matches = frame.every(
      (channel, index) =>
        Math.abs(channel - options.sentinel[index]!) <= tolerance,
    );

    if (matches) {
      if (runLength === 0) runStart = frameIndex;
      runLength += 1;
    } else if (runLength >= 2) {
      break;
    } else {
      runStart = -1;
      runLength = 0;
    }

    frameIndex += 1;
  }

  if (runLength < 2) return null;

  return {
    frameIndex: runStart,
    timeMs: (runStart * 1_000) / options.fps,
    runLength,
    endTimeMs: ((runStart + runLength) * 1_000) / options.fps,
  };
}
