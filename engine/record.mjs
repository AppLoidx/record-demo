const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 22) {
  console.error(
    `Demo recording requires Node 22 or newer (current: ${process.versions.node}). Run "nvm use" inside engine/.`,
  );
  process.exit(1);
}

const { spawn } = await import("node:child_process");
const { constants: fsConstants } = await import("node:fs");
const {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} = await import("node:fs/promises");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { findClapperboardFrame } = await import("./lib/clapperboard.ts");
const { encodeGif, gifPalettePath, logGifResult } = await import(
  "./lib/gif.mjs"
);
const { parseCliArgs } = await import("./lib/record-options.mjs");
const { renderPresetSequence } = await import("./lib/render-presets.mjs");
const { parseTimeline, serializeTimeline } = await import("./lib/timeline.ts");
const { writeSynchronizedTimelines } = await import(
  "./lib/timeline-output.mjs"
);

const demosRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = path.join(demosRoot, "out");
const publicDir = path.join(demosRoot, "public");
const timelinePath = path.join(outputDir, "timeline.json");
const display = ":99";
const expectedViewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
};
const captureFps = 30;
const ownedChildren = new Map();
const ephemeralPaths = new Set();
let cleanupPromise;

function systemEnv(extra = {}) {
  const nodeBin = path.dirname(process.execPath);
  return {
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "C.UTF-8",
    LOGNAME: process.env.LOGNAME,
    PATH: `${nodeBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    ...extra,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function launchOwned(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? demosRoot,
    env: options.env ?? systemEnv(),
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    detached: true,
  });
  ownedChildren.set(child, name);
  child.once("exit", () => ownedChildren.delete(child));
  return child;
}

function childOutputTail(child) {
  let tail = "";
  const append = (chunk) => {
    tail = `${tail}${chunk}`.slice(-8_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => tail.trim();
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode,
    });
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function signalProcessGroup(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stopOwned(child, { finalizeFfmpeg = false } = {}) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (finalizeFfmpeg && child.stdin?.writable) {
    child.stdin.write("q\n");
  } else {
    signalProcessGroup(child, "SIGTERM");
  }

  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!exited) {
    signalProcessGroup(child, "SIGKILL");
    await waitForExit(child);
  }
}

async function cleanup() {
  cleanupPromise ??= (async () => {
    const children = [...ownedChildren.entries()].reverse();
    await Promise.allSettled(
      children.map(([child, name]) =>
        stopOwned(child, { finalizeFfmpeg: name === "ffmpeg capture" }),
      ),
    );
    await Promise.allSettled(
      [...ephemeralPaths].map((filePath) =>
        rm(filePath, { recursive: true, force: true }),
      ),
    );
  })();
  return cleanupPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    console.error(`\nReceived ${signal}; cleaning up demo processes.`);
    await cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

async function executableExists(command) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    try {
      await access(path.join(directory, command), fsConstants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

async function displayGeometry() {
  const child = spawn("xdpyinfo", ["-display", display], {
    env: systemEnv({ DISPLAY: display }),
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  const { code } = await waitForExit(child);
  if (code !== 0) return null;
  const dimensions = stdout.match(/dimensions:\s+(\d+)x(\d+)\s+pixels/);
  const depth = stdout.match(/depth of root window:\s+(\d+)\s+planes/);
  if (!dimensions || !depth) {
    throw new Error(`Could not parse ${display} geometry from xdpyinfo.`);
  }
  return {
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    depth: Number(depth[1]),
  };
}

async function ensureXvfb() {
  if (!(await executableExists("Xvfb"))) {
    throw new Error(
      "Xvfb is required for demo recording. Install it with: sudo apt install -y xvfb",
    );
  }
  if (!(await executableExists("xdpyinfo"))) {
    throw new Error("xdpyinfo is required to verify the Xvfb display geometry.");
  }

  const existing = await displayGeometry();
  if (existing) {
    if (
      existing.width !== 2880 ||
      existing.height !== 1620 ||
      existing.depth !== 24
    ) {
      throw new Error(
        `Existing Xvfb ${display} has ${existing.width}x${existing.height}x${existing.depth} geometry; expected 2880x1620x24.`,
      );
    }
    console.log(`Reusing Xvfb ${display} at 2880x1620x24.`);
    return;
  }

  await Promise.all([
    rm("/tmp/.X99-lock", { force: true }),
    rm("/tmp/.X11-unix/X99", { force: true }),
  ]);
  console.log(`Starting Xvfb ${display} at 2880x1620x24.`);
  const xvfb = launchOwned(
    "Xvfb",
    "Xvfb",
    [display, "-screen", "0", "2880x1620x24", "-nolisten", "tcp", "-ac"],
    { env: systemEnv() },
  );
  const output = childOutputTail(xvfb);
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (xvfb.exitCode !== null || xvfb.signalCode !== null) {
      throw new Error(`Xvfb exited before becoming ready.\n${output()}`);
    }
    const geometry = await displayGeometry();
    if (
      geometry?.width === 2880 &&
      geometry.height === 1620 &&
      geometry.depth === 24
    ) {
      return;
    }
    await delay(100);
  }

  throw new Error(`Xvfb did not become ready.\n${output()}`);
}

async function runCommand(command, args, options = {}) {
  const child = launchOwned(options.name ?? command, command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
  });
  const { code, signal } = await waitForExit(child);
  if (code !== 0) {
    throw new Error(
      `${options.name ?? command} failed (${signal ? `signal ${signal}` : `exit ${code}`}).`,
    );
  }
}

async function runCaptured(command, args) {
  const child = launchOwned(command, command, args, {
    cwd: demosRoot,
    env: systemEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  let stderr = "";
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  const { code, signal } = await waitForExit(child);
  if (code !== 0) {
    throw new Error(
      `${command} failed (${signal ? `signal ${signal}` : `exit ${code}`}).\n${stderr.trim()}`,
    );
  }
  return Buffer.concat(stdout);
}

async function startRecording(masterPath) {
  console.log("Starting 2880x1620 capture at 30fps.");
  const ffmpeg = launchOwned(
    "ffmpeg capture",
    "ffmpeg",
    [
      "-y",
      "-f",
      "x11grab",
      "-draw_mouse",
      "0",
      "-framerate",
      String(captureFps),
      "-video_size",
      "2880x1620",
      "-i",
      display,
      "-an",
      "-c:v",
      "ffv1",
      "-level",
      "3",
      "-g",
      "1",
      "-slicecrc",
      "1",
      masterPath,
    ],
    {
      env: systemEnv({ DISPLAY: display }),
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  const output = childOutputTail(ffmpeg);
  await delay(750);
  if (ffmpeg.exitCode !== null || ffmpeg.signalCode !== null) {
    throw new Error(`ffmpeg could not start capture.\n${output()}`);
  }
  return { ffmpeg, output };
}

function hexToRgb(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) throw new Error(`Unsupported clapperboard colour: ${value}`);
  return match.slice(1).map((channel) => Number.parseInt(channel, 16));
}

async function clapperboardColor() {
  const source = await readFile(
    path.join(demosRoot, "lib", "storyboard.ts"),
    "utf8",
  );
  const match = source.match(
    /export const CLAPPERBOARD_COLOR\s*=\s*["'](#[0-9a-f]{6})["']/i,
  );
  if (!match) {
    throw new Error(
      "Could not read exported CLAPPERBOARD_COLOR from lib/storyboard.ts.",
    );
  }
  return hexToRgb(match[1]);
}

async function detectSyncFlash(masterPath) {
  const pixels = await runCaptured("ffmpeg", [
    "-v",
    "error",
    "-i",
    masterPath,
    // Cold vite compiles can delay the first paint (and the sentinel flash)
    // well past 15s; scan a wide window, it is a cheap 1x1 downscale.
    "-t",
    "60",
    "-vf",
    "scale=1:1:flags=area",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  if (pixels.length % 3 !== 0) {
    throw new Error("ffmpeg returned an incomplete RGB frame series.");
  }

  const frames = [];
  for (let index = 0; index < pixels.length; index += 3) {
    frames.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
  }
  const match = findClapperboardFrame(frames, {
    sentinel: await clapperboardColor(),
    fps: captureFps,
    // The 1x1 downscale averages in non-sentinel pixels (external targets do
    // not always fill the X screen edge-to-edge during startup); observed flash
    // averages reach (52, 249, 41). 64 keeps black/app frames out.
    tolerance: 64,
  });
  if (!match) {
    throw new Error(
      "Could not find two consecutive clapperboard frames in the first 60 seconds of the master.",
    );
  }
  return match;
}

function assertCaptureGeometry(timeline, demoName) {
  const { viewport } = timeline;
  if (
    viewport.width !== expectedViewport.width ||
    viewport.height !== expectedViewport.height ||
    viewport.deviceScaleFactor !== expectedViewport.deviceScaleFactor
  ) {
    throw new Error(
      `Refusing to render ${viewport.width}x${viewport.height} at DSF ${viewport.deviceScaleFactor}; expected 1920x1080 at DSF 1.5.`,
    );
  }
  if (timeline.capture.fps !== captureFps) {
    throw new Error(
      `Refusing to render capture fps ${timeline.capture.fps}; expected ${captureFps}.`,
    );
  }
  if (timeline.name !== demoName) {
    throw new Error(
      `Timeline name "${timeline.name}" does not match requested demo "${demoName}".`,
    );
  }
}

async function createRemotionSource(masterPath, outputPath, syncFlashAt) {
  console.log(
    `Trimming master at ${syncFlashAt.toFixed(2)}ms and transcoding for Remotion.`,
  );
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      masterPath,
      "-ss",
      (syncFlashAt / 1_000).toFixed(9),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `setpts=PTS-STARTPTS,fps=${captureFps}`,
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { name: "Remotion source transcode", cwd: demosRoot, env: systemEnv() },
  );
}

async function renderCompositions(
  demoName,
  timeline,
  videoPath,
  formats,
  windowChrome,
) {
  const videoName = `${demoName}-trimmed-master.mp4`;
  const stagedVideo = path.join(publicDir, videoName);
  const propsPath = path.join(outputDir, `${demoName}-render-props.json`);
  ephemeralPaths.add(stagedVideo);
  ephemeralPaths.add(propsPath);

  await copyFile(videoPath, stagedVideo);
  await writeFile(
    propsPath,
    `${JSON.stringify(
      {
        timeline,
        videoSrc: videoName,
        windowChrome,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return renderPresetSequence(formats, async (preset) => {
    const outputPath = path.join(outputDir, `${demoName}-${preset}.mp4`);
    console.log(`Rendering ${preset} at 60fps.`);
    await runCommand(
      "pnpm",
      [
        "exec",
        "remotion",
        "render",
        "remotion/Root.tsx",
        preset,
        outputPath,
        `--props=${propsPath}`,
        `--public-dir=${publicDir}`,
        "--fps=60",
        "--codec=h264",
        "--crf=18",
        "--concurrency=2",
        "--timeout=120000",
        "--muted",
        "--overwrite",
      ],
      {
        name: `Remotion ${preset} render`,
        cwd: demosRoot,
        env: systemEnv(),
      },
    );
    return outputPath;
  });
}

async function createGif(demoName, editedPath) {
  const gifPath = path.join(outputDir, `${demoName}.gif`);
  const palettePath = gifPalettePath(gifPath);
  ephemeralPaths.add(palettePath);
  const sizeMb = await encodeGif({
    inputPath: editedPath,
    outputPath: gifPath,
    palettePath,
    runCommand,
  });
  logGifResult(path.relative(demosRoot, gifPath), sizeMb);
  return gifPath;
}

async function createPlaywrightEntry(scriptPath) {
  const entryDir = await mkdtemp(
    path.join(outputDir, ".playwright-"),
  );
  const entryPath = path.join(entryDir, "storyboard.demo.ts");
  ephemeralPaths.add(entryDir);
  await copyFile(scriptPath, entryPath);
  return entryPath;
}

async function main() {
  const {
    demoName,
    formats,
    rawOnly,
    scriptPath,
    targetUrl,
    windowChrome,
  } = parseCliArgs(process.argv.slice(2));
  await access(scriptPath, fsConstants.R_OK);
  if (!(await executableExists("Xvfb"))) {
    throw new Error(
      "Xvfb is required for demo recording. Install it with: sudo apt install -y xvfb",
    );
  }
  if (!(await executableExists("ffmpeg"))) {
    throw new Error("ffmpeg with x11grab support is required for demo recording.");
  }

  await mkdir(outputDir, { recursive: true });
  const playwrightEntryPath = await createPlaywrightEntry(scriptPath);
  console.log(`Recording external target ${targetUrl}.`);
  await ensureXvfb();

  const masterPath = path.join(outputDir, `${demoName}-master.mkv`);
  const { ffmpeg, output } = await startRecording(masterPath);
  try {
    await runCommand(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        playwrightEntryPath,
        "--config=playwright.config.ts",
      ],
      {
        name: "Playwright storyboard",
        cwd: demosRoot,
        env: systemEnv({
          DISPLAY: display,
          DEMO_NAME: demoName,
          DEMO_PLAYWRIGHT_ENTRY_PATH: playwrightEntryPath,
          DEMO_SCRIPT_PATH: scriptPath,
          DEMO_TARGET_URL: targetUrl,
        }),
      },
    );
  } finally {
    await stopOwned(ffmpeg, { finalizeFfmpeg: true });
  }
  if (ffmpeg.exitCode !== 0) {
    throw new Error(`ffmpeg capture did not finalize successfully.\n${output()}`);
  }

  const timeline = parseTimeline(await readFile(timelinePath, "utf8"));
  assertCaptureGeometry(timeline, demoName);
  const syncFlash = await detectSyncFlash(masterPath);
  // Trim at the END of the sentinel run so no green frame reaches the render.
  // Storyboard event times are measured from the flash start, so shift them
  // back by the measured flash duration to stay aligned with the picture.
  const flashDurationMs = syncFlash.endTimeMs - syncFlash.timeMs;
  const synchronizedTimeline = {
    ...timeline,
    durationMs: Math.max(0, timeline.durationMs - flashDurationMs),
    capture: {
      ...timeline.capture,
      syncFlashAt: syncFlash.endTimeMs,
    },
    events: timeline.events.map((event) => ({
      ...event,
      t: Math.max(0, event.t - flashDurationMs),
    })),
  };
  assertCaptureGeometry(synchronizedTimeline, demoName);
  await writeSynchronizedTimelines({
    outputDirectory: outputDir,
    demoName,
    content: serializeTimeline(synchronizedTimeline),
  });
  console.log(
    `Clapperboard run at master frame ${syncFlash.frameIndex} x${syncFlash.runLength} (trim at ${syncFlash.endTimeMs.toFixed(2)}ms).`,
  );

  const trimmedMasterPath = path.join(
    outputDir,
    `${demoName}-trimmed-master.mp4`,
  );
  await createRemotionSource(
    masterPath,
    trimmedMasterPath,
    syncFlash.endTimeMs,
  );

  // The raw deliverable: the clean capture, no zoom/cursor/caption edit.
  const rawPath = path.join(outputDir, `${demoName}-raw.mp4`);
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      trimmedMasterPath,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      rawPath,
    ],
    { name: "Raw deliverable transcode", cwd: demosRoot, env: systemEnv() },
  );

  let editedPaths;
  let gifPath;
  if (!rawOnly) {
    editedPaths = await renderCompositions(
      demoName,
      synchronizedTimeline,
      trimmedMasterPath,
      formats,
      windowChrome,
    );
    gifPath = await createGif(demoName, editedPaths[0]);
  }
  console.log("Demo outputs:");
  console.log(rawPath);
  for (const editedPath of editedPaths ?? []) console.log(editedPath);
  if (gifPath) console.log(gifPath);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
