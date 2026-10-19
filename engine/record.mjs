const [nodeMajor = 0, nodeMinor = 0] = process.versions.node
  .split(".")
  .map((part) => Number.parseInt(part, 10));
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 18)) {
  console.error(
    `Demo recording requires Node 22.18 or newer for runtime .ts imports (current: ${process.versions.node}). Run "nvm use" inside engine/.`,
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
  unlink,
  writeFile,
} = await import("node:fs/promises");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { bundledTool } = await import("./lib/ffmpeg.mjs");
const { buildConcatList, parseFrameManifest } = await import(
  "./lib/frames.ts",
);
const { encodeGif, gifPalettePath, logGifResult } = await import(
  "./lib/gif.mjs"
);
const { systemEnv } = await import("./lib/record-env.mjs");
const { parseCliArgs } = await import("./lib/record-options.mjs");
const { renderPresetSequence } = await import("./lib/render-presets.mjs");
const { rewriteStoryboardImports } = await import(
  "./lib/stage-storyboard.ts",
);
const { parseTimeline, serializeTimeline } = await import("./lib/timeline.ts");
const { writeSynchronizedTimelines } = await import(
  "./lib/timeline-output.mjs"
);

const demosRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = path.join(demosRoot, "out");
const publicDir = path.join(demosRoot, "public");
const timelinePath = path.join(outputDir, "timeline.json");
const expectedViewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
};
const captureFps = 60;
const isWindows = process.platform === "win32";
const ownedChildren = new Map();
const ephemeralPaths = new Set();
let cleanupPromise;
let storageStatePathToCleanup;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function launchOwned(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? demosRoot,
    env: options.env ?? systemEnv(),
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    detached: !isWindows,
    // pnpm is a .cmd shim on Windows, which only a shell can start.
    shell: isWindows && command === "pnpm",
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
  if (isWindows) {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stopOwned(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  signalProcessGroup(child, "SIGTERM");
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
      children.map(([child]) => stopOwned(child)),
    );
    await Promise.allSettled(
      [...ephemeralPaths].map((filePath) =>
        rm(filePath, { recursive: true, force: true }),
      ),
    );
  })();
  return cleanupPromise;
}

async function cleanupStorageState() {
  if (!storageStatePathToCleanup) return;
  try {
    await unlink(storageStatePathToCleanup);
  } catch {}
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    console.error(`\nReceived ${signal}; cleaning up demo processes.`);
    await cleanupStorageState();
    await cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
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

async function runFfmpeg(args, name) {
  const [command, commandArgs] = bundledTool("ffmpeg", args);
  await runCommand(command, commandArgs, {
    name,
    cwd: demosRoot,
    env: systemEnv(),
  });
}

// Chrome sends a frame only when the page repaints, so each frame holds until
// the next paint; resampling to a constant rate gives Remotion a normal video.
async function encodeScreencast(demoName, timeline, outputPath) {
  const framesDir = path.join(outputDir, `.frames-${demoName}`);
  const manifestPath = path.join(outputDir, `${demoName}-frames.json`);
  ephemeralPaths.add(framesDir);
  ephemeralPaths.add(manifestPath);
  const { frames } = parseFrameManifest(await readFile(manifestPath, "utf8"));
  const listPath = path.join(framesDir, "frames.txt");
  await writeFile(listPath, buildConcatList(frames, timeline.durationMs), "utf8");
  console.log(
    `Encoding ${frames.length} screencast frames at ${captureFps}fps.`,
  );
  await runFfmpeg(
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-an",
      "-fps_mode",
      "cfr",
      "-r",
      String(captureFps),
      "-t",
      (timeline.durationMs / 1_000).toFixed(3),
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
    ],
    "Screencast encode",
  )
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
  const source = await readFile(scriptPath, "utf8");
  const storyboardPath = path.join(demosRoot, "lib", "storyboard.ts");
  await writeFile(
    entryPath,
    rewriteStoryboardImports(source, storyboardPath),
    "utf8",
  );
  return entryPath;
}

async function main() {
  const {
    browserChannel,
    demoName,
    formats,
    headed,
    profileDir,
    rawOnly,
    scriptPath,
    storageStatePath,
    targetUrl,
    windowChrome,
  } = parseCliArgs(process.argv.slice(2));
  storageStatePathToCleanup = storageStatePath;
  await access(scriptPath, fsConstants.R_OK);

  await mkdir(outputDir, { recursive: true });
  const playwrightEntryPath = await createPlaywrightEntry(scriptPath);
  console.log(`Recording external target ${targetUrl}.`);
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
        DEMO_NAME: demoName,
        DEMO_PLAYWRIGHT_ENTRY_PATH: playwrightEntryPath,
        DEMO_SCRIPT_PATH: scriptPath,
        ...(storageStatePath
          ? { DEMO_STORAGE_STATE_PATH: storageStatePath }
          : {}),
        ...(profileDir ? { DEMO_PROFILE_DIR: profileDir } : {}),
        ...(browserChannel ? { DEMO_BROWSER_CHANNEL: browserChannel } : {}),
        ...(headed ? { DEMO_HEADED: "1" } : {}),
        DEMO_TARGET_URL: targetUrl,
      }),
    },
  );

  const timeline = parseTimeline(await readFile(timelinePath, "utf8"));
  assertCaptureGeometry(timeline, demoName);
  await writeSynchronizedTimelines({
    outputDirectory: outputDir,
    demoName,
    content: serializeTimeline(timeline),
  });

  const trimmedMasterPath = path.join(
    outputDir,
    `${demoName}-trimmed-master.mp4`,
  );
  await encodeScreencast(demoName, timeline, trimmedMasterPath);

  // The raw deliverable: the clean capture, no zoom/cursor/caption edit.
  const rawPath = path.join(outputDir, `${demoName}-raw.mp4`);
  await runFfmpeg(
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
    "Raw deliverable transcode",
  );

  let editedPaths;
  let gifPath;
  if (!rawOnly) {
    editedPaths = await renderCompositions(
      demoName,
      timeline,
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
  await cleanupStorageState();
  await cleanup();
}
