const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 22) {
  console.error(
    `The composition proof requires Node 22 or newer (current: ${process.versions.node}). Run "nvm use" inside engine/.`,
  );
  process.exit(1);
}

const { spawn } = await import("node:child_process");
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
const windowName = "composition-proof-window-1.png";
const windowPath = path.join(publicDir, windowName);
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

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fixture = parseTimeline(await readFile(fixturePath, "utf8"));
  const timeline = { ...fixture, durationMs: 11000, events: [
    ...fixture.events,
    { t: 0, kind: "role", label: "Customer" },
    { t: 3400, kind: "window", image: windowName, imageWidth: 1140, imageHeight: 840,
      title: "Inbox", enterMs: 520, holdMs: 2600, exitMs: 320,
      highlight: { x: 96, y: 504, width: 420, height: 84 }, click: true },
    { t: 7400, kind: "transition", label: "Review the request", role: "Ops", outMs: 380, cardMs: 900, inMs: 460 },
    { t: 8230, kind: "role", label: "Ops" },
  ].sort((a, b) => a.t - b.t) };
  // A real raster asset with readable content and a CTA proves image scaling and interaction.
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 760, height: 560 }, deviceScaleFactor: 1.5 });
    await page.setContent(`<html><body style="margin:0;padding:64px;box-sizing:border-box;background:#fff;color:#333;font-family:Arial">
      <div style="font-size:14px;color:#888;letter-spacing:2px">SWIPELUX · INBOX</div>
      <h1 style="font-size:32px;margin:36px 0 20px">Your request is ready</h1>
      <p style="font-size:20px;line-height:1.6;color:#777;max-width:540px">The team has everything they need.<br>Open your request to continue.</p>
      <div style="position:absolute;left:64px;top:336px;width:280px;height:56px;border-radius:10px;background:#292929;color:white;display:flex;align-items:center;justify-content:center;font-size:18px">View request →</div>
      </body></html>`);
    await page.screenshot({ path: windowPath, scale: "device" });
  } finally { await browser.close(); }
  await writeFile(path.join(outputDir, "composition-proof-timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
  const durationSeconds = Math.max(1, timeline.durationMs / 1_000 + 0.5);
  await mkdir(outputDir, { recursive: true });

  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=2880x1620:rate=30",
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
      "--concurrency=2",
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
    [sourcePath, windowPath, propsPath].map((filePath) =>
      rm(filePath, { force: true }),
    ),
  );
}
