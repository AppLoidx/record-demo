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
});
