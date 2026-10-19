import { describe, expect, it } from "vitest";
import {
  buildConcatList,
  frameTimeMs,
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

describe("buildConcatList", () => {
  it("holds each frame until the next paint and the last until the end", () => {
    const list = buildConcatList(
      [
        { file: "000001.jpg", t: 500 },
        { file: "000000.jpg", t: 120 },
      ],
      2_000,
    );

    expect(list).toBe(
      [
        "file '000000.jpg'",
        "duration 0.500000",
        "file '000001.jpg'",
        "duration 1.500000",
        "file '000001.jpg'",
        "",
      ].join("\n"),
    );
  });

  it("keeps only the latest paint for a shared timestamp", () => {
    const list = buildConcatList(
      [
        { file: "000000.jpg", t: 0 },
        { file: "000001.jpg", t: 0 },
      ],
      1_000,
    );

    expect(list).not.toContain("000000.jpg");
    expect(list).toContain("duration 1.000000");
  });

  it("never emits a zero-length final frame", () => {
    expect(buildConcatList([{ file: "000000.jpg", t: 900 }], 900)).toContain(
      "duration 0.900000",
    );
    expect(
      buildConcatList(
        [
          { file: "000000.jpg", t: 0 },
          { file: "000001.jpg", t: 900 },
        ],
        900,
      ),
    ).toContain("duration 0.016667");
  });

  it("fails loudly when nothing was captured", () => {
    expect(() => buildConcatList([], 1_000)).toThrow(/no frames/);
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
