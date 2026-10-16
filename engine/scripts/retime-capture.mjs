import { execFile, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readCaptureClockSteps } from "../lib/capture-clock.mjs";
import { correctCaptureTimeMs, remotionSourceArgs } from "../lib/capture-timing.ts";
import { parseTimeline } from "../lib/timeline.ts";

// The saved timeline must have the original PTS-domain syncFlashAt.
const [masterPath, timelinePath, outputPath] = process.argv.slice(2);
if (!masterPath || !timelinePath || !outputPath) {
  throw new Error("Usage: node scripts/retime-capture.mjs <master> <original-timeline> <output>");
}
const timeline = parseTimeline(await readFile(timelinePath, "utf8"));
const execFileAsync = promisify(execFile);
const steps = await readCaptureClockSteps(masterPath, timeline.capture.fps, async (command, args) => {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024 });
  return Buffer.from(stdout);
});
const syncFlashAt = correctCaptureTimeMs(timeline.capture.syncFlashAt, steps);
console.log(`Corrected flash end: ${syncFlashAt.toFixed(2)}ms`);
await mkdir(path.dirname(outputPath), { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", remotionSourceArgs(masterPath, outputPath, syncFlashAt, steps, timeline.capture.fps), { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${signal ?? code}`)));
});
