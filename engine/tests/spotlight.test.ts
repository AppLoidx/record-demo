import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../lib/timeline";
import { resolveSpotlightOpacity } from "../remotion/Spotlight";

const spotlight: Extract<TimelineEvent, { kind: "spotlight" }> = {
  t: 1_000,
  kind: "spotlight",
  rect: { x: 100, y: 200, width: 300, height: 160 },
  durationMs: 450,
  holdMs: 800,
};

describe("resolveSpotlightOpacity", () => {
  it("eases through fade-in, hold, and fade-out", () => {
    const fadeIn = resolveSpotlightOpacity(spotlight, 1_225);
    const fadeOut = resolveSpotlightOpacity(spotlight, 2_475);

    expect(resolveSpotlightOpacity(spotlight, 999)).toBe(0);
    expect(fadeIn).toBeGreaterThan(0);
    expect(fadeIn).toBeLessThan(1);
    expect(resolveSpotlightOpacity(spotlight, 1_600)).toBe(1);
    expect(fadeOut).toBeCloseTo(fadeIn);
    expect(resolveSpotlightOpacity(spotlight, 2_701)).toBe(0);
  });
});
