import { describe, expect, it } from "vitest";
import type { Timeline } from "../lib/timeline";
import {
  scoreCameraSeries,
  scoreTimeline,
} from "../scripts/score-motion.mjs";
import { demoTheme } from "../remotion/theme";

describe("motion scoring", () => {
  it("simulates a timeline and reports its camera move duration", () => {
    const timeline: Timeline = {
      version: 1,
      name: "eased-zoom",
      viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
      capture: { fps: 30, syncFlashAt: 0 },
      durationMs: 1_800,
      events: [
        {
          t: 200,
          kind: "zoom",
          rect: { x: 240, y: 135, width: 1440, height: 810 },
          durationMs: 1_200,
        },
        {
          t: 600,
          kind: "spotlight",
          rect: { x: 300, y: 200, width: 480, height: 240 },
          durationMs: 450,
          holdMs: 600,
        },
      ],
    };

    const score = scoreTimeline(timeline);

    expect(score.metrics.cameraMoves).toEqual({
      count: 1,
      durationsMs: [demoTheme.zoom.minimumDurationMs],
    });
  });

  it("scores eased motion with quiet edges and continuous velocity", () => {
    const easedSamples = [
      { scale: 1, translateX: 0, translateY: 0 },
      ...Array.from({ length: 61 }, (_, frame) => {
        const time = frame / 60;
        const progress =
          6 * time ** 5 - 15 * time ** 4 + 10 * time ** 3;
        return {
          scale: 1 + progress * 0.2,
          translateX: progress * -200,
          translateY: 0,
        };
      }),
      { scale: 1.2, translateX: -200, translateY: 0 },
    ];
    const score = scoreCameraSeries(
      easedSamples,
      [
        {
          eventIndex: 0,
          startMs: 100,
          durationMs: 1_000,
          startFrame: 1,
          durationFrames: 60,
        },
      ],
      60,
      1,
      2560,
    );

    expect(score.perMove[0]?.startEdgeRatio).toBeLessThanOrEqual(0.15);
    expect(score.perMove[0]?.endEdgeRatio).toBeLessThanOrEqual(0.15);
    expect(score.perMove[0]?.maxVelocityJumpRatio).toBeLessThanOrEqual(0.5);
    expect(score.perMove[0]?.edgeVerdict).toBe("PASS");
    expect(score.perMove[0]?.discontinuityVerdict).toBe("PASS");
    expect(score.verdict).toBe("PASS");
  });

  it("fails a hard-edged linear camera move", () => {
    const score = scoreCameraSeries(
      [
        { scale: 1, translateX: 0, translateY: 0 },
        { scale: 1, translateX: 0, translateY: 0 },
        { scale: 1.2, translateX: -10, translateY: 0 },
        { scale: 1.4, translateX: -20, translateY: 0 },
        { scale: 1.6, translateX: -30, translateY: 0 },
        { scale: 1.6, translateX: -30, translateY: 0 },
      ],
      [
        {
          eventIndex: 0,
          startMs: 100,
          durationMs: 300,
          startFrame: 1,
          durationFrames: 3,
        },
      ],
      10,
      1,
      100,
    );

    expect(score.metrics.relativeZoomRate.max).toBeCloseTo(2);
    expect(score.metrics.relativeZoomRate.p95).toBeCloseTo(2);
    expect(score.metrics.relativeZoomRate.verdict).toBe("FAIL");
    expect(score.metrics.panSpeed.maxPxPerSecond).toBeCloseTo(100);
    expect(score.metrics.panSpeed.p95PxPerSecond).toBeCloseTo(100);
    expect(score.metrics.panSpeed.maxFrameWidthsPerSecond).toBeCloseTo(1);
    expect(score.metrics.panSpeed.p95FrameWidthsPerSecond).toBeCloseTo(1);
    expect(score.metrics.panSpeed.verdict).toBe("WARN");
    expect(score.perMove[0]?.startEdgeRatio).toBeCloseTo(1);
    expect(score.perMove[0]?.endEdgeRatio).toBeCloseTo(1);
    expect(score.perMove[0]?.maxVelocityJumpRatio).toBeCloseTo(1);
    expect(score.perMove[0]?.discontinuityVerdict).toBe("FAIL");
    expect(score.verdict).toBe("FAIL");
  });
});
