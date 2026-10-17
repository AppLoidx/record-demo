/** Packet timestamps and corrections are in seconds in the master's PTS domain. */
export type ClockStep = { atSeconds: number; correctionSeconds: number };

// WSL steps the wall clock forward 1.3-2.5 s every ~33 s; x11grab stamps frames with it.
// Genuine capture stalls stay near 1 s or below, so anything above this is a clock step.
const CLOCK_STEP_THRESHOLD_SECONDS = 1.2;

export function detectClockSteps(pts: readonly number[], captureFps: number): ClockStep[] {
  const steps: ClockStep[] = [];
  for (let index = 1; index < pts.length; index += 1) {
    const atSeconds = pts[index]!;
    const gap = atSeconds - pts[index - 1]!;
    if (gap > CLOCK_STEP_THRESHOLD_SECONDS) {
      steps.push({ atSeconds, correctionSeconds: gap - 1 / captureFps });
    }
  }
  return steps;
}

export function correctCaptureTimeMs(timeMs: number, steps: readonly ClockStep[]): number {
  return timeMs - steps.reduce(
    (sum, step) => sum + (step.atSeconds <= timeMs / 1_000 ? step.correctionSeconds * 1_000 : 0),
    0,
  );
}

export function buildClockStepSetpts(steps: readonly ClockStep[]): string {
  if (steps.length === 0) return "setpts=PTS";
  // Escape gte's comma for ffmpeg's filtergraph parser (arguments bypass a shell).
  const corrections = steps.map(
    ({ atSeconds, correctionSeconds }) => `gte(PTS*TB\\,${atSeconds})*${correctionSeconds}`,
  ).join("+");
  return `setpts=(PTS*TB-(${corrections}))/TB`;
}

/** Shared by recording and standalone retranscodes: trim only after correcting PTS. */
export function remotionSourceArgs(
  masterPath: string,
  outputPath: string,
  syncFlashAt: number,
  steps: readonly ClockStep[],
  captureFps: number,
): string[] {
  return [
    "-y", "-i", masterPath, "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", "0", "-pix_fmt", "yuv420p", "-vf",
    `${buildClockStepSetpts(steps)},trim=start=${(syncFlashAt / 1_000).toFixed(9)},setpts=PTS-STARTPTS,fps=${captureFps}`,
    "-vsync", "cfr", "-movflags", "+faststart", outputPath,
  ];
}
