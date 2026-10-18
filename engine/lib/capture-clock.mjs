import { detectClockSteps } from "./capture-timing.ts";

export async function readCaptureClockSteps(masterPath, captureFps, runCaptured) {
  const packets = await runCaptured("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time",
    "-of", "csv=p=0", masterPath,
  ]);
  const pts = packets.toString("utf8").trim().split(/\s+/).map(Number).filter(Number.isFinite);
  const steps = detectClockSteps(pts, captureFps);
  for (const step of steps) {
    console.log(`Clock step at master ${step.atSeconds.toFixed(2)}s: -${step.correctionSeconds.toFixed(2)}s`);
  }
  return steps;
}
