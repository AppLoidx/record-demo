import { describe, expect, it } from "vitest";
import { parseTimeline } from "../lib/timeline";
import { resolveOutro } from "../remotion/Outro";

describe("resolveOutro", () => {
  it("resolves a validated hand-crafted outro through enter and hold", () => {
    const timeline = parseTimeline(
      JSON.stringify({
        version: 1,
        name: "outro-proof",
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
        capture: { fps: 30, syncFlashAt: 0 },
        durationMs: 3_400,
        events: [
          {
            t: 1_000,
            kind: "outro",
            title: "Any website. One storyboard.",
            durationMs: 2_400,
          },
        ],
      }),
    );

    expect(resolveOutro(timeline, 999)).toEqual({
      event: timeline.events[0],
      progress: 0,
      started: false,
    });
    expect(resolveOutro(timeline, 1_300).progress).toBeGreaterThan(0);
    expect(resolveOutro(timeline, 1_300).progress).toBeLessThan(1);
    expect(resolveOutro(timeline, 1_600)).toEqual({
      event: timeline.events[0],
      progress: 1,
      started: true,
    });
    expect(resolveOutro(timeline, 3_399).progress).toBe(1);
  });
});
