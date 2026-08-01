import { describe, expect, it } from "vitest";
import { findClapperboardFrame } from "../lib/clapperboard";

describe("findClapperboardFrame", () => {
  it("returns the first frame in the first two-frame sentinel run", () => {
    const result = findClapperboardFrame(
      [
        [24, 30, 35],
        [4, 252, 3],
        [2, 255, 1],
        [24, 30, 35],
      ],
      { sentinel: [0, 255, 0], fps: 30 },
    );

    expect(result).toEqual({
      frameIndex: 1,
      timeMs: 1000 / 30,
      runLength: 2,
      endTimeMs: 3000 / 30,
    });
  });

  it("measures the full sentinel run so the trim lands on the first app frame", () => {
    const result = findClapperboardFrame(
      [
        [24, 30, 35],
        [0, 255, 0],
        [0, 255, 0],
        [0, 255, 0],
        [0, 255, 0],
        [24, 30, 35],
      ],
      { sentinel: [0, 255, 0], fps: 30 },
    );

    expect(result?.runLength).toBe(4);
    expect(result?.endTimeMs).toBe(5000 / 30);
  });

  it("measures a run that extends to the end of the scan window", () => {
    const result = findClapperboardFrame(
      [
        [24, 30, 35],
        [0, 255, 0],
        [0, 255, 0],
      ],
      { sentinel: [0, 255, 0], fps: 30 },
    );

    expect(result?.runLength).toBe(2);
    expect(result?.endTimeMs).toBe(3000 / 30);
  });

  it("ignores isolated matching frames", () => {
    const result = findClapperboardFrame(
      [
        [0, 255, 0],
        [30, 30, 30],
        [0, 255, 0],
        [0, 255, 0],
      ],
      { sentinel: [0, 255, 0], fps: 30 },
    );

    expect(result?.frameIndex).toBe(2);
  });

  it("returns null when no sentinel run exists", () => {
    expect(
      findClapperboardFrame(
        [
          [20, 220, 20],
          [20, 220, 20],
        ],
        { sentinel: [0, 255, 0], fps: 30 },
      ),
    ).toBeNull();
  });
});
