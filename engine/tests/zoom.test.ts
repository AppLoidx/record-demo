import { Easing, interpolate } from "remotion";
import { describe, expect, it } from "vitest";
import type { Timeline } from "../lib/timeline";
import {
  calculateCameraTransform,
  resolveCameraTransform,
} from "../remotion/zoom";
import { demoTheme } from "../remotion/theme";

const viewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
};

describe("calculateCameraTransform", () => {
  const frameWidth = 2560;
  const frameHeight = 1440;

  it.each([
    ["top-left corner", { x: 0, y: 0, width: 200, height: 120 }],
    ["top-right corner", { x: 1720, y: 0, width: 200, height: 120 }],
    ["bottom-left corner", { x: 0, y: 960, width: 200, height: 120 }],
    ["bottom-right corner", { x: 1720, y: 960, width: 200, height: 120 }],
    ["top edge", { x: 860, y: 0, width: 200, height: 120 }],
    ["right edge", { x: 1720, y: 480, width: 200, height: 120 }],
    ["bottom edge", { x: 860, y: 960, width: 200, height: 120 }],
    ["left edge", { x: 0, y: 480, width: 200, height: 120 }],
  ])("fully contains a focus rect at the %s", (_, focusRect) => {
    const camera = calculateCameraTransform(
      focusRect,
      viewport,
      frameWidth,
      frameHeight,
    );
    const sourcePixelsPerCssPixel =
      camera.scale * viewport.deviceScaleFactor;
    const visibleSource = {
      x: -camera.translateX / sourcePixelsPerCssPixel,
      y: -camera.translateY / sourcePixelsPerCssPixel,
      width: frameWidth / sourcePixelsPerCssPixel,
      height: frameHeight / sourcePixelsPerCssPixel,
    };

    expect(visibleSource.x).toBeLessThanOrEqual(focusRect.x);
    expect(visibleSource.y).toBeLessThanOrEqual(focusRect.y);
    expect(visibleSource.x + visibleSource.width).toBeGreaterThanOrEqual(
      focusRect.x + focusRect.width,
    );
    expect(visibleSource.y + visibleSource.height).toBeGreaterThanOrEqual(
      focusRect.y + focusRect.height,
    );
  });

  it("aspect-matches a wide focus rect before padding and fitting", () => {
    const { scale } = calculateCameraTransform(
      { x: 190, y: 310, width: 1200, height: 100 },
      viewport,
      frameWidth,
      frameHeight,
    );
    const aspectMatchedHeight = 1200 / (frameWidth / frameHeight);
    const expectedScale =
      frameHeight /
      ((aspectMatchedHeight + 96 * 2) * viewport.deviceScaleFactor);

    expect(scale).toBeCloseTo(expectedScale);
  });

  it("fills the frame exactly when the rect is the whole viewport", () => {
    const { scale, translateX, translateY } = calculateCameraTransform(
      { x: 0, y: 0, width: 1920, height: 1080 },
      viewport,
      frameWidth,
      frameHeight,
    );

    expect(scale).toBeCloseTo(8 / 9);
    expect(translateX).toBeCloseTo(0);
    expect(translateY).toBeCloseTo(0);
  });
});

describe("resolveCameraTransform", () => {
  it("keeps a capped tight zoom monotonic and velocity-continuous", () => {
    const fps = 60;
    const durationMs = demoTheme.zoom.minimumDurationMs;
    const durationFrames = Math.round((durationMs / 1_000) * fps);
    const timeline: Timeline = {
      version: 1,
      name: "tight-zoom",
      viewport,
      capture: { fps: 30, syncFlashAt: 0 },
      durationMs: durationMs + 200,
      events: [
        {
          t: 0,
          kind: "zoom",
          rect: { x: 760, y: 427.5, width: 400, height: 225 },
          durationMs,
        },
      ],
    };
    const scales = Array.from(
      { length: durationFrames + 1 },
      (_, frame) =>
        resolveCameraTransform(timeline, frame, fps, 2560, 1440).scale,
    );
    const sampleFrame = Math.round(durationFrames * 0.25);
    const [x1, y1, x2, y2] = demoTheme.zoom.easing;
    const progress = interpolate(sampleFrame, [0, durationFrames], [0, 1], {
      easing: Easing.bezier(x1, y1, x2, y2),
    });
    const velocities = scales.slice(1).map(
      (scale, index) => (scale - scales[index]!) * fps,
    );
    const peakVelocity = Math.max(...velocities);
    const velocityJumps = velocities.slice(1).map(
      (velocity, index) => Math.abs(velocity - velocities[index]!),
    );
    const edgeFrames = Math.ceil(velocities.length * 0.1);
    const startEdgeVelocity = Math.max(...velocities.slice(0, edgeFrames));
    const endEdgeVelocity = Math.max(...velocities.slice(-edgeFrames));

    expect(
      scales.every(
        (scale, index) => index === 0 || scale >= scales[index - 1]!,
      ),
    ).toBe(true);
    expect(scales[sampleFrame]).toBeCloseTo(
      scales[0]! * (scales.at(-1)! / scales[0]!) ** progress,
      10,
    );
    expect(Math.max(...velocityJumps) / peakVelocity).toBeLessThan(0.5);
    expect(startEdgeVelocity / peakVelocity).toBeLessThanOrEqual(0.15);
    expect(endEdgeVelocity / peakVelocity).toBeLessThanOrEqual(0.15);
  });

  it("keeps position continuous when a second zoom interrupts the first", () => {
    const fps = 60;
    const frameWidth = 2560;
    const frameHeight = 1440;
    const handoffMs = 500;
    const handoffFrame = Math.round((handoffMs / 1_000) * fps);
    const settledFrame = Math.round(
      ((handoffMs + demoTheme.zoom.minimumDurationMs) / 1_000) * fps,
    );
    const firstRect = { x: 760, y: 427.5, width: 400, height: 225 };
    const secondRect = { x: 1280, y: 675, width: 480, height: 270 };
    const timeline: Timeline = {
      version: 1,
      name: "overlapping-zooms",
      viewport,
      capture: { fps: 30, syncFlashAt: 0 },
      durationMs: handoffMs + demoTheme.zoom.minimumDurationMs + 200,
      events: [
        { t: 0, kind: "zoom", rect: firstRect, durationMs: 700 },
        { t: handoffMs, kind: "zoom", rect: secondRect, durationMs: 700 },
      ],
    };
    const cameras = Array.from(
      { length: settledFrame + 1 },
      (_, frame) =>
        resolveCameraTransform(
          timeline,
          frame,
          fps,
          frameWidth,
          frameHeight,
        ),
    );
    const firstMoveAtHandoff = resolveCameraTransform(
      { ...timeline, events: [timeline.events[0]!] },
      handoffFrame,
      fps,
      frameWidth,
      frameHeight,
    );
    const atHandoff = cameras[handoffFrame]!;

    expect(atHandoff.scale).toBeCloseTo(firstMoveAtHandoff.scale);
    expect(atHandoff.translateX).toBeCloseTo(firstMoveAtHandoff.translateX);
    expect(atHandoff.translateY).toBeCloseTo(firstMoveAtHandoff.translateY);

    for (const field of ["scale", "translateX", "translateY"] as const) {
      const handoffDelta = Math.abs(
        cameras[handoffFrame]![field] - cameras[handoffFrame - 1]![field],
      );
      const neighboringDelta = Math.max(
        Math.abs(
          cameras[handoffFrame - 1]![field] -
            cameras[handoffFrame - 2]![field],
        ),
        Math.abs(
          cameras[handoffFrame + 1]![field] -
            cameras[handoffFrame]![field],
        ),
      );

      expect(handoffDelta).toBeLessThanOrEqual(neighboringDelta * 3);
    }

    const settled = cameras[settledFrame]!;
    const expectedSettled = calculateCameraTransform(
      secondRect,
      viewport,
      frameWidth,
      frameHeight,
    );

    expect(settled.scale).toBeCloseTo(expectedSettled.scale);
    expect(settled.translateX).toBeCloseTo(expectedSettled.translateX);
    expect(settled.translateY).toBeCloseTo(expectedSettled.translateY);
  });
});
