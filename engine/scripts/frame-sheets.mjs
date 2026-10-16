import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parseTimeline, calloutTotalDuration, spotlightTotalDuration, windowTotalDuration, transitionTotalDuration } from "../lib/timeline.ts";

// Match the runtime TypeScript resolution used by the motion scorer.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".") || extname(specifier)) {
        throw error;
      }
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const { createSceneCameraPath } = await import("../lib/scene-camera.ts");
const { compositionFps } = await import("../remotion/theme.ts");
const execFileAsync = promisify(execFile);
const engineRoot = fileURLToPath(new URL("../", import.meta.url));

// Pure: durations come from the same live camera path used by the renderer.
/** @param {import("../lib/timeline.ts").Timeline} timeline */
export function computeFrameSheets(timeline, videoDurationMs, width = 2560, height = 1440) {
  const chronological = { ...timeline, events: [...timeline.events].sort((a, b) => a.t - b.t) };
  const camera = createSceneCameraPath(chronological, compositionFps, width, height);
  const zoomDurations = new Map(camera.moves.map((move) => [move.event, move.durationMs]));
  return chronological.events.flatMap((event) => {
    let durationMs;
    if (event.kind === "zoom") durationMs = zoomDurations.get(event);
    else if (event.kind === "spotlight") durationMs = spotlightTotalDuration(event);
    else if (event.kind === "callout") durationMs = calloutTotalDuration(event);
    else if (event.kind === "window") durationMs = windowTotalDuration(event);
    else if (event.kind === "transition") durationMs = transitionTotalDuration(event);
    else if (event.kind === "outro") durationMs = event.durationMs;
    else return [];
    const startMs = Math.min(videoDurationMs, Math.max(0, event.t - 250));
    const endMs = Math.min(videoDurationMs, event.t + durationMs + 500);
    return [{
      kind: event.kind,
      startMs,
      endMs,
      frameTimesMs: Array.from({ length: 12 }, (_, index) => startMs + (endMs - startMs) * index / 11),
    }];
  });
}

async function requireFile(path, kind) {
  try {
    await access(path);
  } catch {
    throw new Error(`${kind} is missing or inaccessible: ${path}`);
  }
}

async function probeVideo(videoPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries",
    "format=duration:stream=width,height,avg_frame_rate,duration", "-of", "json", videoPath,
  ]);
  const metadata = JSON.parse(stdout);
  const stream = metadata.streams?.[0];
  const durationMs = Number(stream?.duration ?? metadata.format?.duration) * 1000;
  if (!stream || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`Cannot determine video length: ${videoPath}`);
  }
  const [numerator, denominator] = (stream.avg_frame_rate ?? "0/1").split("/").map(Number);
  return { durationMs, width: stream.width, height: stream.height, fps: numerator / denominator || compositionFps };
}

async function writeSheet(videoPath, outputPath, sheet, video) {
  const temporaryDir = await mkdtemp(join(tmpdir(), "frame-sheet-"));
  let labelsAvailable = true;
  try {
    for (const [index, timeMs] of sheet.frameTimesMs.entries()) {
      const tilePath = join(temporaryDir, `${String(index).padStart(2, "0")}.png`);
      // Seeking to EOF yields no frame; use the last displayed frame there.
      const seekSeconds = Math.min(timeMs / 1000, Math.max(0, video.durationMs / 1000 - 1 / video.fps));
      const filters = ["scale=640:-2", "setsar=1"];
      const label = `drawtext=text='${(timeMs / 1000).toFixed(2)}s':x=10:y=10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65`;
      const extract = async (withLabel) => {
        await execFileAsync("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-y", "-ss", String(seekSeconds), "-i", videoPath,
          "-frames:v", "1", "-vf", [...filters, ...(withLabel ? [label] : [])].join(","), tilePath,
        ]);
        await access(tilePath);
      };
      try {
        await extract(labelsAvailable);
      } catch (error) {
        if (!labelsAvailable) throw error;
        labelsAvailable = false;
        await extract(false);
      }
    }
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", join(temporaryDir, "%02d.png"),
      "-vf", "tile=4x3:nb_frames=12", "-frames:v", "1", outputPath,
    ]);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

async function runCli() {
  const [name, ...args] = process.argv.slice(2);
  if (!name || name.startsWith("--")) {
    throw new Error("Usage: frame-sheets.mjs <name> [--timeline out/timeline.json] [--video out/<name>-16x9.mp4]");
  }
  let timelinePath = resolve(engineRoot, "out/timeline.json");
  let videoPath = resolve(engineRoot, `out/${name}-16x9.mp4`);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!["--timeline", "--video"].includes(flag) || !value || value.startsWith("--")) {
      throw new Error(`Invalid option: ${flag}`);
    }
    if (flag === "--timeline") timelinePath = resolve(engineRoot, value);
    else videoPath = resolve(engineRoot, value);
  }
  await requireFile(timelinePath, "Timeline");
  await requireFile(videoPath, "Video");
  const timeline = parseTimeline(await readFile(timelinePath, "utf8"));
  const video = await probeVideo(videoPath);
  const sheets = computeFrameSheets(timeline, video.durationMs, video.width, video.height);
  const sheetsDir = resolve(engineRoot, "out/sheets");
  await mkdir(sheetsDir, { recursive: true });
  for (const [index, sheet] of sheets.entries()) {
    const outputPath = join(sheetsDir, `${String(index + 1).padStart(2, "0")}-${sheet.kind}.png`);
    await writeSheet(videoPath, outputPath, sheet, video);
    console.log(`${outputPath} ${sheet.kind} ${(sheet.startMs / 1000).toFixed(2)}-${(sheet.endMs / 1000).toFixed(2)}s`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
