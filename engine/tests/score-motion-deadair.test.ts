import { describe, expect, it } from "vitest";
import type { Timeline } from "../lib/timeline";
import { detectDeadAirSpans } from "../scripts/score-motion.mjs";

function timeline(
  durationMs: number,
  events: Timeline["events"],
): Timeline {
  return {
    version: 1,
    name: "dead-air-test",
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
    capture: { fps: 30, syncFlashAt: 0 },
    durationMs,
    events,
  };
}

describe("dead-air detection", () => {
  it("flags a five-second static gap", () => {
    const result = detectDeadAirSpans(
      timeline(6_000, [
        { t: 0, kind: "caption", text: "Stale caption", durationMs: 5_000 },
        { t: 0, kind: "cursor", x: 100, y: 100 },
      ]),
    );

    expect(result).toEqual([
      { startMs: 0, durationMs: 5_000, verdict: "WARN" },
    ]);
  });

  it("does not flag a caption-covered gap with cursor movement", () => {
    const result = detectDeadAirSpans(
      timeline(6_000, [
        { t: 0, kind: "caption", text: "Follow the cursor", durationMs: 5_000 },
        { t: 0, kind: "cursor", x: 100, y: 100 },
        { t: 2_500, kind: "cursor", x: 160, y: 100 },
        { t: 5_000, kind: "cursor", x: 220, y: 100 },
      ]),
    );

    expect(result).toEqual([]);
  });

  it("exempts a gap inside the outro", () => {
    const result = detectDeadAirSpans(
      timeline(6_000, [
        { t: 0, kind: "outro", title: "Done", durationMs: 5_000 },
      ]),
    );

    expect(result).toEqual([]);
  });

  it("ignores a three-second gap below the threshold", () => {
    const result = detectDeadAirSpans(timeline(4_000, []));

    expect(result).toEqual([]);
  });

  it("uses the full spotlight lifetime before measuring the next gap", () => {
    const result = detectDeadAirSpans(
      timeline(5_000, [
        {
          t: 0,
          kind: "spotlight",
          rect: { x: 100, y: 100, width: 400, height: 200 },
          durationMs: 300,
          holdMs: 1_500,
        },
        { t: 3_900, kind: "caption", text: "Next beat", durationMs: 100 },
      ]),
    );

    expect(result).toEqual([]);
  });

  it("flags a long spotlight hold without swallowing its fade-out window", () => {
    const result = detectDeadAirSpans(
      timeline(23_000, [
        {
          t: 0,
          kind: "spotlight",
          rect: { x: 100, y: 100, width: 400, height: 200 },
          durationMs: 300,
          holdMs: 20_000,
        },
      ]),
    );

    expect(result).toEqual([
      { startMs: 300, durationMs: 20_000, verdict: "WARN" },
    ]);
  });

  it("uses the minimum zoom animation duration before measuring the next gap", () => {
    const result = detectDeadAirSpans(
      timeline(4_700, [
        {
          t: 0,
          kind: "zoom",
          rect: { x: 100, y: 100, width: 800, height: 450 },
          durationMs: 100,
        },
        { t: 3_600, kind: "caption", text: "Next beat", durationMs: 100 },
      ]),
    );

    expect(result).toEqual([]);
  });

  it.each([
    { spanDurationMs: 3_499, expected: [] },
    {
      spanDurationMs: 3_500,
      expected: [{ startMs: 0, durationMs: 3_500, verdict: "WARN" }],
    },
  ])(
    "pins the $spanDurationMs ms static-span threshold",
    ({ spanDurationMs, expected }) => {
      expect(detectDeadAirSpans(timeline(spanDurationMs + 1_000, []))).toEqual(
        expected,
      );
    },
  );

  it.each([
    {
      cursorTravelPx: 39,
      expected: [{ startMs: 0, durationMs: 3_500, verdict: "WARN" }],
    },
    { cursorTravelPx: 41, expected: [] },
  ])(
    "pins $cursorTravelPx px of cursor travel around the static threshold",
    ({ cursorTravelPx, expected }) => {
      const result = detectDeadAirSpans(
        timeline(4_500, [
          { t: 0, kind: "cursor", x: 100, y: 100 },
          { t: 3_500, kind: "cursor", x: 100 + cursorTravelPx, y: 100 },
        ]),
      );

      expect(result).toEqual(expected);
    },
  );

  it("reports two separate static spans", () => {
    const result = detectDeadAirSpans(
      timeline(10_000, [
        { t: 3_500, kind: "caption", text: "Active beat", durationMs: 1_000 },
      ]),
    );

    expect(result).toEqual([
      { startMs: 0, durationMs: 3_500, verdict: "WARN" },
      { startMs: 4_500, durationMs: 4_500, verdict: "WARN" },
    ]);
  });
});
