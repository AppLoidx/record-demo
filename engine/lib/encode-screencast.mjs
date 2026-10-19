import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundledTool } from "./ffmpeg.mjs";
import { framesForTicks, jpegSize, parseFrameManifest } from "./frames.ts";

const defaultSpawn = (command, args) =>
  spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });

/**
 * Chrome sends a screencast frame only when the page repaints. Pick the frame
 * on screen at every output tick and pipe the JPEGs to ffmpeg, so each output
 * frame sits at its own time and the last paint holds to the end of the
 * timeline.
 */
export async function encodeScreencast({
  framesDir,
  manifestPath,
  durationMs,
  fps,
  expectedSize,
  outputPath,
  spawnProcess = defaultSpawn,
}) {
  const { frames } = parseFrameManifest(await readFile(manifestPath, "utf8"));
  const ticks = framesForTicks(frames, durationMs, fps);
  const first = jpegSize(await readFile(path.join(framesDir, ticks[0])));
  if (
    first.width !== expectedSize.width ||
    first.height !== expectedSize.height
  ) {
    throw new Error(
      `Screencast frames are ${first.width}x${first.height}; expected ${expectedSize.width}x${expectedSize.height}.`,
    );
  }

  const [command, args] = bundledTool("ffmpeg", [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-c:v",
    "mjpeg",
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  const ffmpeg = spawnProcess(command, args);
  let stderr = "";
  ffmpeg.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  const exited = new Promise((resolve, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("exit", (code, signal) => resolve({ code, signal }));
  });
  // A dead ffmpeg reports through its exit code below, not a pipe error.
  ffmpeg.stdin.on("error", () => {});

  let previousFile;
  let previousData;
  try {
    for (const file of ticks) {
      if (file !== previousFile) {
        previousData = await readFile(path.join(framesDir, file));
        previousFile = file;
      }
      if (!ffmpeg.stdin.write(previousData)) {
        await Promise.race([
          new Promise((resolve) => ffmpeg.stdin.once("drain", resolve)),
          exited,
        ]);
      }
      if (ffmpeg.exitCode !== null || ffmpeg.signalCode !== null) break;
    }
  } finally {
    ffmpeg.stdin.end();
  }
  const { code, signal } = await exited;
  if (code !== 0) {
    throw new Error(
      `Screencast encode failed (${signal ? `signal ${signal}` : `exit ${code}`}).\n${stderr.trim()}`,
    );
  }
  return { frameCount: frames.length, tickCount: ticks.length };
}
