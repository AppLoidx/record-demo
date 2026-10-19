import { describe, expect, it } from "vitest";
import {
  frameTimeMs,
  framesForTicks,
  jpegSize,
  parseFrameManifest,
} from "../lib/frames";

describe("frameTimeMs", () => {
  it("maps Chrome epoch-second timestamps onto the storyboard clock", () => {
    expect(frameTimeMs(1_000.25, 1_000_000, 0)).toBe(250);
  });

  it("clamps frames painted before t=0 to the start", () => {
    expect(frameTimeMs(999.9, 1_000_000, 0)).toBe(0);
  });

  it("falls back to the receive time when Chrome omits the timestamp", () => {
    expect(frameTimeMs(undefined, 1_000_000, 1_000_400)).toBe(400);
  });
});

describe("framesForTicks", () => {
  it("shows the latest paint at each tick and holds the last to the end", () => {
    const ticks = framesForTicks(
      [
        { file: "b.jpg", t: 40 },
        { file: "a.jpg", t: 10 },
      ],
      100,
      50,
    );

    // Ticks at 0, 20, 40, 60, 80ms; a.jpg also covers the time before it.
    expect(ticks).toEqual(["a.jpg", "a.jpg", "b.jpg", "b.jpg", "b.jpg"]);
  });

  it("anchors every tick to its own time, so paint jitter never drifts", () => {
    // 601 paints over 10s with gaps alternating 15ms and 18.33ms.
    const frames = [];
    let t = 0;
    for (let index = 0; index < 600; index += 1) {
      frames.push({ file: `${index}.jpg`, t });
      t += index % 2 === 0 ? 15 : 50 / 3;
    }
    frames.push({ file: "marker.jpg", t: 10_000 });

    const ticks = framesForTicks(frames, 10_500, 60);

    expect(ticks).toHaveLength(630);
    expect(ticks.indexOf("marker.jpg")).toBe(600);
    expect(ticks.at(-1)).toBe("marker.jpg");
  });

  it("keeps the final static stretch, e.g. an outro", () => {
    const ticks = framesForTicks([{ file: "only.jpg", t: 0 }], 2_000, 60);

    expect(ticks).toHaveLength(120);
  });

  it("fails loudly when nothing was captured", () => {
    expect(() => framesForTicks([], 1_000, 60)).toThrow(/no frames/);
  });
});

describe("jpegSize", () => {
  it("reads dimensions from the start-of-frame segment", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0x54, 0x0b, 0x40, 0x03,
    ]);

    expect(jpegSize(jpeg)).toEqual({ width: 2880, height: 1620 });
  });

  it("rejects data without a frame header", () => {
    expect(() => jpegSize(Uint8Array.from([0xff, 0xd8, 0x00]))).toThrow(
      /JPEG dimensions/,
    );
  });
});

describe("parseFrameManifest", () => {
  it("accepts frame file names and finite times", () => {
    expect(
      parseFrameManifest('{"frames":[{"file":"000000.jpg","t":0}]}'),
    ).toEqual({ frames: [{ file: "000000.jpg", t: 0 }] });
  });

  it("rejects path-like file names", () => {
    expect(() =>
      parseFrameManifest('{"frames":[{"file":"../x.jpg","t":0}]}'),
    ).toThrow(/Invalid frame manifest/);
  });
});
