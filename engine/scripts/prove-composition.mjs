const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 22) {
  console.error(
    `The composition proof requires Node 22 or newer (current: ${process.versions.node}). Run "nvm use" inside engine/.`,
  );
  process.exit(1);
}

const { spawn } = await import("node:child_process");
const { bundledTool } = await import("../lib/ffmpeg.mjs");
const {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} = await import("node:fs/promises");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const { parseTimeline } = await import("../lib/timeline.ts");
const { compositionPresets } = await import("../remotion/theme.ts");

const demosRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = path.join(demosRoot, "out");
const publicDir = path.join(demosRoot, "public");
const fixturePath = path.join(demosRoot, "fixtures", "timeline.json");
const sourceName = "composition-proof-source.mp4";
const sourcePath = path.join(publicDir, sourceName);
const propsPath = path.join(outputDir, "composition-proof-props.json");
const presets = compositionPresets.map(({ id }) => id);

function systemEnv() {
  return {
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "C.UTF-8",
    LOGNAME: process.env.LOGNAME,
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  };
}

function run(command, args, { capture = false } = {}) {
  if (command === "ffmpeg" || command === "ffprobe") {
    [command, args] = bundledTool(command, args);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: demosRoot,
      env: systemEnv(),
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    const stdout = [];
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
        return;
      }
      reject(
        new Error(
          `${command} failed (${signal ? `signal ${signal}` : `exit ${code}`})`,
        ),
      );
    });
  });
}

async function writeTestPattern(outputPath) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1.5,
    });
    await page.setContent(`<body style="margin:0;height:100vh;background:
      repeating-linear-gradient(45deg,#1b2a4a 0 60px,#25406f 60px 120px)">
      <div style="font:bold 160px sans-serif;color:#fff;padding:120px">
      record-demo composition proof</div></body>`);
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
  }
}

async function main() {
  const timeline = parseTimeline(await readFile(fixturePath, "utf8"));
  const durationSeconds = Math.max(1, timeline.durationMs / 1_000 + 0.5);
  await mkdir(outputDir, { recursive: true });

  // The bundled ffmpeg has no test-pattern sources, so Chromium paints one at
  // the capture size and ffmpeg loops it.
  const patternPath = path.join(outputDir, "composition-proof-pattern.png");
  await writeTestPattern(patternPath);
  await run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "60",
    "-i",
    patternPath,
    "-t",
    durationSeconds.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "12",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    sourcePath,
  ]);
  await writeFile(
    propsPath,
    `${JSON.stringify(
      {
        timeline,
        videoSrc: sourceName,
        windowChrome: "macos",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  for (const preset of presets) {
    const outputPath = path.join(
      outputDir,
      `composition-proof-${preset}.mp4`,
    );
    await run("pnpm", [
      "exec",
      "remotion",
      "render",
      "remotion/Root.tsx",
      preset,
      outputPath,
      `--props=${propsPath}`,
      "--fps=60",
      "--codec=h264",
      "--crf=18",
      "--muted",
      "--overwrite",
      "--scale=0.25",
    ]);

    if ((await stat(outputPath)).size === 0) {
      throw new Error(`Composition proof output is empty for ${preset}`);
    }
    const duration = Number.parseFloat(
      await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          outputPath,
        ],
        { capture: true },
      ),
    );
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(
        `Composition proof has invalid duration for ${preset}: ${duration}`,
      );
    }

    console.log(
      `Composition proof passed: ${path.relative(demosRoot, outputPath)} (${duration.toFixed(2)}s)`,
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.all(
    [sourcePath, propsPath].map((filePath) =>
      rm(filePath, { force: true }),
    ),
  );
}
