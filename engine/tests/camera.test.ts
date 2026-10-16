import { describe, expect, it } from "vitest";
import {
  autoZoomDurationMs,
  cameraWindow,
  createCameraPath,
  interpolateCameraWindow,
  windowTransform,
} from "../lib/camera";
import type { Timeline } from "../lib/timeline";

const viewport = { width: 1_920, height: 1_080, deviceScaleFactor: 1.5 };
const timeline = (events: Timeline["events"]): Timeline => ({
  version: 1,
  name: "camera-math",
  viewport,
  capture: { fps: 30, syncFlashAt: 0 },
  durationMs: 8_000,
  events,
});

describe("camera windows", () => {
  it("holds an interior fixed point stationary through a pure zoom", () => {
    const start = { left: 0, top: 0, width: 2_880 };
    const end = { left: 360, top: 180, width: 1_980 };
    // The similarity's fixed source point is (1152, 576).
    const point = { x: 1_152, y: 576 };
    const expected = { x: 1_024, y: 512 };
    for (let frame = 0; frame <= 120; frame += 1) {
      const camera = windowTransform(
        interpolateCameraWindow(start, end, frame / 120),
        2_560,
      );
      const screen = {
        x: point.x * camera.scale + camera.translateX,
        y: point.y * camera.scale + camera.translateY,
      };
      expect(
        Math.hypot(screen.x - expected.x, screen.y - expected.y),
      ).toBeLessThan(0.5);
      expect(cameraWindow(camera, 2_560).width).toBeCloseTo(
        2_560 / camera.scale,
      );
    }
    expect(interpolateCameraWindow(start, end, 0)).toEqual(start);
    expect(interpolateCameraWindow(start, end, 1)).toEqual(end);
  });

  it.each([1, 1 + 1e-5])(
    "uses linear positioning for a near-equal width ratio %s",
    (ratio) => {
      const start = { left: 100, top: 50, width: 1_000 };
      const end = { left: 500, top: 250, width: 1_000 * ratio };
      expect(interpolateCameraWindow(start, end, 0.25)).toEqual({
        left: 200,
        top: 100,
        width: 1_000 * ratio ** 0.25,
      });
    },
  );

  it.each([16 / 9, 1, 9 / 16])(
    "keeps every edge in bounds at aspect %s",
    (aspect) => {
      const sourceWidth = 2_880;
      const sourceHeight = 1_620;
      const wideWidth = Math.min(sourceWidth, sourceHeight * aspect);
      const start = {
        left: sourceWidth - wideWidth,
        top: sourceHeight - wideWidth / aspect,
        width: wideWidth,
      };
      const end = { left: 0, top: 0, width: wideWidth / 1.45 };
      for (let frame = 0; frame <= 100; frame += 1) {
        const window = interpolateCameraWindow(start, end, frame / 100);
        expect(window.left).toBeGreaterThanOrEqual(-1e-9);
        expect(window.top).toBeGreaterThanOrEqual(-1e-9);
        expect(window.left + window.width).toBeLessThanOrEqual(
          sourceWidth + 1e-9,
        );
        expect(window.top + window.width / aspect).toBeLessThanOrEqual(
          sourceHeight + 1e-9,
        );
      }
    },
  );
});

describe("camera durations", () => {
  it("stays in 1650..2400ms and increases with scale and pan travel", () => {
    const start = { left: 0, top: 0, width: 2_880 };
    const small = { left: 140, top: 80, width: 2_600 };
    const large = { left: 720, top: 400, width: 1_500 };
    expect(autoZoomDurationMs(start, start, 16 / 9)).toBe(1_650);
    const smallDuration = autoZoomDurationMs(start, small, 16 / 9);
    const largeDuration = autoZoomDurationMs(start, large, 16 / 9);
    expect(smallDuration).toBeGreaterThan(1_650);
    expect(largeDuration).toBeGreaterThan(smallDuration);
    expect(largeDuration).toBeLessThanOrEqual(2_400);
    expect(
      autoZoomDurationMs(
        start,
        { left: 1_000, top: 500, width: 100 },
        16 / 9,
      ),
    ).toBe(2_400);
    const pan = { ...start, left: 200 };
    expect(autoZoomDurationMs(start, pan, 16 / 9)).toBeGreaterThan(1_650);
    expect(
      autoZoomDurationMs(start, { ...pan, left: 500 }, 16 / 9),
    ).toBeGreaterThan(autoZoomDurationMs(start, pan, 16 / 9));
  });

  it("resolves overlapping auto durations from the previous live path at the start frame", () => {
    const first = {
      t: 200,
      kind: "zoom",
      rect: { x: 700, y: 400, width: 400, height: 225 },
    } as const;
    const second = { t: 700, kind: "zoom", rect: null } as const;
    const third = {
      t: 1_000,
      kind: "zoom",
      rect: { x: 1_200, y: 650, width: 300, height: 200 },
    } as const;
    const path = createCameraPath(
      timeline([first, second, third]),
      60,
      2_560,
      1_440,
    );
    for (const [index, move] of path.moves.entries()) {
      const previousPath = createCameraPath(
        timeline([first, second, third].slice(0, index)),
        60,
        2_560,
        1_440,
      );
      const liveStart = cameraWindow(
        previousPath.atFrame(move.startFrame),
        2_560,
      );
      expect(move.durationMs).toBeCloseTo(
        autoZoomDurationMs(liveStart, move.target, 16 / 9),
        10,
      );
      expect(path.atFrame(move.startFrame)).toEqual(
        previousPath.atFrame(move.startFrame),
      );
    }
    // Auto timing differs from pretending the first zoom had already landed.
    expect(path.moves[1]!.durationMs).toBeLessThan(
      autoZoomDurationMs(
        path.moves[0]!.target,
        path.moves[1]!.target,
        16 / 9,
      ),
    );
  });

  it.each([0, 1_200, 1_650, 2_100, 3_000])(
    "honors explicit %sms with the existing floor and frame rounding",
    (durationMs) => {
      const path = createCameraPath(
        timeline([{ t: 0, kind: "zoom", rect: null, durationMs }]),
        60,
        2_560,
        1_440,
      );
      const expected = Math.max(1_650, durationMs);
      expect(path.moves[0]!.durationMs).toBe(expected);
      expect(path.moves[0]!.durationFrames).toBe(
        Math.round((expected / 1_000) * 60),
      );
    },
  );
});
