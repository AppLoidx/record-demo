import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

// Reuse Remotion CLI's installed renderer and bundler; no additional dependencies.
const require = createRequire(import.meta.resolve("@remotion/cli/package.json"));
const { bundle } = require("@remotion/bundler");
const { selectComposition, renderMedia, renderStill } = require("@remotion/renderer");
const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "out/labs");
const browserExecutable = chromium.executablePath();
const serveUrl = await bundle({ entryPoint: path.join(root, "remotion/Root.tsx"), onProgress() {} });
await mkdir(output, { recursive: true });
const thresholds = {
  CutLab: [0, 100, 360, 500, 720, 900, 1080, 1150, 1350, 1650, 1900, 2000, 2080, 2180, 2270, 2540, 3060, 3360],
  CarryCutLab: [0, 360, 1650, 1700, 1880, 2000, 2270, 2540, 4190, 4490, 4600, 5020, 5200],
  RailLab: [200, 560, 1200, 1720, 2200, 2380, 2720, 3100, 3250, 3620, 3700, 3920, 3960, 4560, 4640, 4900, 5460, 5800, 6160, 6500, 6860],
  CarryLab: [2500, 2680, 2800, 3250, 3400, 3510, 3670, 4030, 4110, 4190, 4450, 4710, 5010, 5430, 5610],
  CalloutLab: [600, 800, 820, 1080, 1300, 1750, 4750, 4970, 5300, 5500, 5520, 5780, 6000, 6450, 8050, 8270],
};
const heroFrames = { CutLab: 136, CarryCutLab: 290, RailLab: 178, CarryLab: 230, CalloutLab: 414 };
const requested = process.argv.slice(2);
const selected = requested.length ? requested : Object.keys(thresholds);
for (const lab of selected) if (!(lab in thresholds)) throw new Error(`Unknown lab: ${lab}`);
const reportPath = path.join(output, "adjacent-frame-diffs.json");
const previous = requested.length ? JSON.parse(await readFile(reportPath, "utf8").catch(() => "[]")) : [];
const report = previous.filter((item) => !selected.includes(item.lab));
for (const lab of selected) {
  for (const preset of ["16x9", "1x1", "9x16"]) {
    const id = preset === "16x9" ? lab : `${lab}-${preset}`;
    const composition = await selectComposition({ serveUrl, id, browserExecutable });
    const stem = `${lab}-${preset}`;
    const outputLocation = path.join(output, `${stem}.mp4`);
    await renderMedia({ serveUrl, composition, codec: "h264", crf: 12, muted: true,
      scale: 0.5, concurrency: 2, browserExecutable, outputLocation,
      onProgress() {} });
    await renderStill({ serveUrl, composition, frame: heroFrames[lab], browserExecutable,
      output: path.join(output, `${stem}.png`), imageFormat: "png" });
    const extra = { CutLab: ["settled", 180], CarryCutLab: ["settled", 340], RailLab: ["chapter", 257], CarryLab: ["settled", 360], CalloutLab: ["single-line", 150] }[lab];
    await renderStill({ serveUrl, composition, frame: extra[1], browserExecutable,
      output: path.join(output, `${stem}-${extra[0]}.png`), imageFormat: "png" });
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", outputLocation, "-vf",
      "fps=2,scale=400:-1,tile=4x5:padding=6:margin=6:color=white", "-frames:v", "1",
      path.join(output, `${stem}-sheet.png`)], { stdio: "inherit" });
    const boundaries = [];
    for (const ms of thresholds[lab]) {
      const frame = Math.ceil(ms * composition.fps / 1000);
      const start = Math.max(0, frame - 2);
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", outputLocation, "-vf",
        `select=between(n\\,${start}\\,${start + 4}),scale=320:-1`, "-vsync", "0",
        "-frames:v", "5", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { maxBuffer: 12 * 1024 * 1024 });
      if (raw.length === 0 || raw.length % 5 !== 0) throw new Error(`Missing boundary frames: ${stem} ${ms}`);
      const size = raw.length / 5;
      const diffs = [];
      for (let f = 1; f < 5; f++) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += Math.abs(raw[f * size + i] - raw[(f - 1) * size + i]);
        diffs.push(sum / size);
      }
      boundaries.push({ ms, frame, adjacentMeanAbsoluteRGB: diffs });
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", outputLocation, "-vf",
        `select=between(n\\,${start}\\,${start + 4}),scale=400:-1,tile=5x1:padding=4:margin=4:color=white`,
        "-frames:v", "1", path.join(output, `${stem}-boundary-${ms}.png`)], { stdio: "inherit" });
    }
    report.push({ lab, preset, outputLocation, boundaries });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Rendered ${stem}: ${composition.durationInFrames} frames; checked ${boundaries.length} phase boundaries`);
  }
}
