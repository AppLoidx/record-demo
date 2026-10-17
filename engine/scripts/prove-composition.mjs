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
const { WindowCapture } = await import("../lib/window-capture.ts");
const { compositionPresets, demoTheme } = await import("../remotion/theme.ts");

const demosRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = path.join(demosRoot, "out");
const publicDir = path.join(demosRoot, "public");
const fixturePath = path.join(demosRoot, "fixtures", "timeline.json");
const sourceName = "composition-proof-source.mp4";
const windowName = "composition-proof-window-1.png";
const windowPath = path.join(publicDir, windowName);
const sourcePath = path.join(publicDir, sourceName);
const sourceStillPath = path.join(publicDir, "composition-proof-ui.png");
const beforeStillPath = path.join(publicDir, "composition-proof-before.png");
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
  const capture = new WindowCapture({ deviceScaleFactor: 1.5, outputDirectory: publicDir });
  let windowAsset;
  try {
    await capture.render({ html: `<html><body style="margin:0;height:1080px;box-sizing:border-box;padding:80px;background:#fff;color:#333;font-family:Arial">
      <nav style="font-size:28px;border-bottom:1px solid #ddd;padding-bottom:32px">Accounts　　Payments　　Team</nav>
      <h1 style="font-size:52px;margin-top:100px">Account request pending</h1>
      <p style="font-size:34px;color:#777">The team is reviewing your business details.</p>
      <section style="margin-top:90px;font-size:38px;line-height:2">Example Company<br>Status: In review<br>Account details will appear after approval</section>
      </body></html>` }, { width: 1920 }, "composition-proof-before.png");
    await capture.render({ html: `<html><body style="margin:0;height:1080px;box-sizing:border-box;padding:80px;background:#fff;color:#333;font-family:Arial">
      <nav style="font-size:28px;border-bottom:1px solid #ddd;padding-bottom:32px">Accounts　　Payments　　Team</nav>
      <h1 style="font-size:52px;margin-top:100px">Named account issued</h1>
      <p style="font-size:34px;color:#777">Your USD account is ready to receive payments.</p>
      <section style="margin-top:90px;display:flex;justify-content:space-between;font-size:38px;line-height:2">
        <div>Account holder<br>Example Company<br>Status: Approved</div>
        <div>Routing number 021000021<br>Account number 123456789<br>Currency USD</div>
      </section></body></html>` }, { width: 1920 }, "composition-proof-ui.png");
    windowAsset = await capture.render({ html: `<html><body style="margin:0;padding:64px;box-sizing:border-box;height:1200px;background:#fff;color:#333;font-family:Arial;display:flex;flex-direction:column">
      <div style="font-size:14px;color:#888;letter-spacing:2px">SWIPELUX · INBOX</div>
      <h1 style="font-size:32px;margin:36px 0 20px">Your request is ready</h1>
      <p style="font-size:20px;line-height:1.6;color:#777;max-width:540px">The team has everything they need.<br>Open your request to continue.</p>
      <div style="margin-top:64px;border-top:1px solid #eee;padding-top:28px;font-size:20px;line-height:1.8">Business details received<br>Documents verified<br>Ready for team review</div>
      <div style="margin-top:auto"><button style="width:280px;height:56px;border:0;border-radius:10px;background:#292929;color:white;font-size:18px">View request →</button>
      <p style="font-size:16px;color:#888;margin-top:32px">End of message · Everything is included</p></div>
      </body></html>` }, { width: 760, highlight: "button" }, windowName);
    if (windowAsset.imageHeight !== 1800) throw new Error(`Tall capture should be 1800 image px, got ${windowAsset.imageHeight}`);
    for (const [name, html, expectedHeight, targetY] of [
      ["inner-scroll", '<style>html,body,#app{height:100%;margin:0}#app{overflow:auto}.content{height:1200px;position:relative}button{position:absolute;top:1100px;left:40px;width:200px;height:50px}</style><div id="app"><div class="content"><button>Open</button></div></div>', 1800, 1650],
      ["viewport-height", '<style>body{margin:0}header{height:60px}main{min-height:100vh}footer{height:40px}</style><header>Top</header><main>Body</main><footer>Footer</footer>', 2100, undefined],
    ]) {
      const image = `composition-proof-${name}.png`;
      try {
        const asset = await capture.render({ html }, { width: 760, ...(targetY === undefined ? {} : { highlight: "button" }) }, image);
        if (asset.imageHeight !== expectedHeight || (targetY !== undefined && asset.highlight?.y !== targetY))
          throw new Error(`Window fit regression: ${name} ${JSON.stringify(asset)}`);
        console.log(`Window fit passed: ${name} (${asset.imageWidth}x${asset.imageHeight})`);
      } finally { await rm(path.join(publicDir, image), { force: true }); }
    }
  } finally { await capture.close(); }
  const timeline = { ...fixture, durationMs: 16800, events: [
    ...fixture.events,
    { t: 0, kind: "role", label: "Customer" },
    { t: 3400, kind: "window", ...windowAsset,
      title: "Inbox", enterMs: demoTheme.window.enterMs, holdMs: 2600, exitMs: demoTheme.window.exitMs, click: true },
    { t: 7400, kind: "transition", label: "Review the request", role: "Ops", chapter: { index: 2, total: 5 },
      outMs: demoTheme.transition.outMs, cardMs: 3500, inMs: demoTheme.transition.inMs },
    { t: 9600, kind: "role", label: "Ops" },
    { t: 11000, kind: "cursor", x: 1450, y: 530 },
    { t: 12200, kind: "caption", text: "The account is ready", durationMs: 1500 },
    { t: 12400, kind: "cursor", x: 1450, y: 530 },
    { t: 12400, kind: "click", x: 1450, y: 530 },
    { t: 13800, kind: "outro", title: "Named account: requested, reviewed, approved, issued.", durationMs: 2400 },
    { t: 12500, kind: "callout", rect: { x: 1000, y: 500, width: 240, height: 90 },
      text: "Merchant is notified by email", holdMs: 1800, side: "right" },
  ].sort((a, b) => a.t - b.t) };
  await writeFile(path.join(outputDir, "composition-proof-timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
  const durationSeconds = Math.max(1, timeline.durationMs / 1_000 + 0.5);
  await mkdir(outputDir, { recursive: true });

  await run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    beforeStillPath,
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    sourceStillPath,
    "-filter_complex",
    "[0:v][1:v]overlay=enable='gte(t,10.8)':shortest=1[v]",
    "-map",
    "[v]",
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

    // 3500ms captured card - 1200ms visible card = exactly 2300ms removed.
    const expectedSeconds = (timeline.durationMs - 2300) / 1000;
    if (Math.abs(duration - expectedSeconds) > 1 / 60) {
      throw new Error(`Elastic proof duration: expected ${expectedSeconds}s, got ${duration}s`);
    }

    const framesDir = path.join(outputDir, "elastic-proof-frames");
    await mkdir(framesDir, { recursive: true });
    for (const [label, seconds] of [["before-card", 7.3], ["card-stagger", 8.2], ["card-in", 8.6],
      ["cut-before", 9.05 - 1 / 60], ["cut-after", 9.05], ["after-card", 9.8],
      ["caption-cursor", 10.5], ["callout", 11.0], ["window-in", 5.22],
      ["outro-start", 11.5], ["outro-caption-fade", 11.8], ["outro-stagger", 12.75],
      ["outro-landings", 13.0], ["outro-final", duration - 1 / 60]]) {
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(seconds), "-i", outputPath,
        "-frames:v", "1", path.join(framesDir, `${preset}-${label}.png`)]);
    }
    console.log(
      `Composition proof passed: ${path.relative(demosRoot, outputPath)} (${(timeline.durationMs / 1000).toFixed(2)}s -> ${duration.toFixed(2)}s; cut 2300ms)`,
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
    [sourcePath, sourceStillPath, beforeStillPath, windowPath, propsPath].map((filePath) =>
      rm(filePath, { force: true }),
    ),
  );
}
