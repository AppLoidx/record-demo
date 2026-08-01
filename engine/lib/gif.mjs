import { stat } from "node:fs/promises";
import path from "node:path";

export function gifPalettePath(outputPath) {
  const output = path.parse(outputPath);
  return path.join(output.dir, `.${output.name}-palette-${process.pid}.png`);
}

export async function encodeGif({
  inputPath,
  outputPath,
  palettePath,
  runCommand,
}) {
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff",
      "-frames:v",
      "1",
      "-update",
      "1",
      palettePath,
    ],
    { name: "GIF palette generation" },
  );
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      inputPath,
      "-i",
      palettePath,
      "-lavfi",
      "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
      outputPath,
    ],
    { name: "GIF encode" },
  );

  return (await stat(outputPath)).size / 1_000_000;
}

export function logGifResult(displayPath, sizeMb) {
  console.log(`GIF written: ${displayPath} (${sizeMb.toFixed(1)} MB)`);
  if (sizeMb > 15) {
    console.warn(
      `Warning: ${displayPath} exceeds 15 MB; this clip is long for GIF.`,
    );
  }
}
