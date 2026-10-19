import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { encodeScreencast } from "../lib/encode-screencast.mjs";
import { bundledTool } from "../lib/ffmpeg.mjs";

const execFileAsync = promisify(execFile);
const WIDTH = 64;
const HEIGHT = 36;
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function crc32(data: Buffer) {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function solidPng([red, green, blue]: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(WIDTH * 3).map((_, index) => [red, green, blue][index % 3]!),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(HEIGHT).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function ffmpeg(args: string[]) {
  const [command, commandArgs] = bundledTool("ffmpeg", args);
  return execFileAsync(command, commandArgs, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Dominant channel of each decoded frame: "r", "g" or "b". */
async function frameColors(videoPath: string) {
  const { stdout } = await ffmpeg([
    "-v", "error", "-i", videoPath,
    "-vf", "scale=1:1:flags=area", "-pix_fmt", "rgb24",
    "-c:v", "rawvideo", "-f", "image2pipe", "-",
  ]);
  const colors: string[] = [];
  for (let offset = 0; offset + 2 < stdout.length; offset += 3) {
    const channels = [stdout[offset]!, stdout[offset + 1]!, stdout[offset + 2]!];
    colors.push("rgb"[channels.indexOf(Math.max(...channels))]!);
  }
  return colors;
}

describe("encodeScreencast with the bundled ffmpeg", () => {
  it("places every paint at its own tick and holds the last to the end", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "encode-screencast-"));
    directories.push(directory);
    const paints = [
      { file: "000000.jpg", t: 0, color: [230, 20, 20] as [number, number, number] },
      { file: "000001.jpg", t: 505, color: [20, 230, 20] as [number, number, number] },
      { file: "000002.jpg", t: 1_000, color: [20, 20, 230] as [number, number, number] },
    ];
    for (const { file, color } of paints) {
      const pngPath = path.join(directory, `${file}.png`);
      await writeFile(pngPath, solidPng(color));
      await ffmpeg(["-v", "error", "-y", "-i", pngPath, "-c:v", "mjpeg", path.join(directory, file)]);
    }
    const manifestPath = path.join(directory, "frames.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ frames: paints.map(({ file, t }) => ({ file, t })) }),
    );
    const outputPath = path.join(directory, "master.mp4");

    const result = await encodeScreencast({
      framesDir: directory,
      manifestPath,
      durationMs: 2_000,
      fps: 60,
      expectedSize: { width: WIDTH, height: HEIGHT },
      outputPath,
    });

    expect(result).toEqual({ frameCount: 3, tickCount: 120 });
    const colors = await frameColors(outputPath);
    // Ticks 0-30 (0-500ms) red, 31-59 (516-983ms) green, 60-119 blue.
    expect(colors.join("")).toBe(
      "r".repeat(31) + "g".repeat(29) + "b".repeat(60),
    );
  }, 60_000);

  it("refuses frames that are not the capture size", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "encode-screencast-"));
    directories.push(directory);
    const pngPath = path.join(directory, "a.png");
    await writeFile(pngPath, solidPng([0, 0, 0]));
    await ffmpeg(["-v", "error", "-y", "-i", pngPath, "-c:v", "mjpeg", path.join(directory, "a.jpg")]);
    const manifestPath = path.join(directory, "frames.json");
    await writeFile(manifestPath, JSON.stringify({ frames: [{ file: "a.jpg", t: 0 }] }));

    await expect(
      encodeScreencast({
        framesDir: directory,
        manifestPath,
        durationMs: 100,
        fps: 60,
        expectedSize: { width: 2_880, height: 1_620 },
        outputPath: path.join(directory, "master.mp4"),
      }),
    ).rejects.toThrow(/64x36; expected 2880x1620/);
  }, 60_000);
});
