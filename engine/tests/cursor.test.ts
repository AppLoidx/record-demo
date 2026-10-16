import type { Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorDurationMs, cursorPath, moveCursor } from "../lib/cursor";

afterEach(() => vi.restoreAllMocks());

describe("cursor duration", () => {
  it("scales monotonically with distance and respects the 260/950ms clamps", () => {
    const durations = [2, 10, 50, 100, 500, 1_000, 10_000].map((distance) =>
      cursorDurationMs(distance, 24),
    );
    expect(durations).toEqual([...durations].sort((a, b) => a - b));
    expect(cursorDurationMs(2, 1_000)).toBe(260);
    expect(durations.at(-1)).toBe(950);
    expect(cursorDurationMs(100, 24)).toBeCloseTo(
      250 + 150 * Math.log2(1 + 100 / 24),
    );
    expect(cursorDurationMs(100, 100)).toBeLessThan(
      cursorDurationMs(100, 24),
    );
    expect(cursorDurationMs(100, 1)).toBe(cursorDurationMs(100, 24));
  });
});

describe("cursorPath", () => {
  it("uses the requested cubic-bezier timing on a quadratic arc with an exact endpoint", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1_000, y: 0 };
    const path = cursorPath(from, to, 160);
    expect(path).toEqual(cursorPath(from, to, 160));
    expect(path).toHaveLength(160);
    // At Bezier parameter 0.5, cubic timing x=0.29375 and y=0.5.
    // The spatial quadratic is then at (500, 30), half the control offset.
    expect(path[46]!.x).toBeCloseTo(500, 6);
    expect(path[46]!.y).toBeCloseTo(30, 6);
    expect(path[79]!.x).toBeGreaterThan(750);
    expect(path.at(-1)).toEqual(to);
    expect(from).toEqual({ x: 0, y: 0 });
    expect(cursorPath(from, to, 1)).toEqual([to]);
  });

  it.each([
    { x: 100, y: 0 },
    { x: -100, y: 0 },
    { x: 0, y: 100 },
    { x: 0, y: -100 },
    { x: 10_000, y: 5_000 },
    { x: -10_000, y: -5_000 },
  ])(
    "bows consistently left of the directed segment toward $x,$y",
    (delta) => {
      const from = { x: 11, y: 29 };
      const to = { x: from.x + delta.x, y: from.y + delta.y };
      const distance = Math.hypot(delta.x, delta.y);
      const path = cursorPath(from, to, 60);
      for (const point of path) {
        const deviation =
          (delta.x * (point.y - from.y) - delta.y * (point.x - from.x)) /
          distance;
        expect(deviation).toBeGreaterThanOrEqual(-1e-9);
        expect(deviation).toBeLessThanOrEqual(60);
      }
      expect(path.at(-1)).toEqual(to);
    },
  );

  it.each([0, 1, 1.999])(
    "skips %spx movement without events or waits",
    async (distance) => {
      const from = { x: 10, y: 20 };
      const to = { x: 10 + distance, y: 20 };
      const page = { waitForTimeout: vi.fn(), mouse: { move: vi.fn() } };
      const onMove = vi.fn();
      expect(cursorPath(from, to, 60)).toEqual([]);
      expect(cursorDurationMs(distance, 24)).toBe(0);
      await moveCursor(page as unknown as Page, from, to, onMove, 24);
      expect(page.waitForTimeout).not.toHaveBeenCalled();
      expect(page.mouse.move).not.toHaveBeenCalled();
      expect(onMove).not.toHaveBeenCalled();
    },
  );

  it("paces samples at about 60Hz while accounting for mouse-call time", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const from = { x: 0, y: 0 };
    const to = { x: 400, y: 0 };
    const samples: number[] = [];
    const page = {
      waitForTimeout: vi.fn(async (delay: number) => {
        time += delay;
      }),
      mouse: {
        move: vi.fn(async () => {
          time += 2;
        }),
      },
    };
    const duration = cursorDurationMs(400, 40);
    const steps = Math.ceil(duration / (1_000 / 60));
    await moveCursor(
      page as unknown as Page,
      from,
      to,
      () => samples.push(time),
      40,
    );
    expect(samples).toHaveLength(steps);
    expect(samples.at(-1)).toBeCloseTo(duration + 2);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]! - samples[index - 1]!).toBeCloseTo(
        duration / steps,
      );
    }
    expect(page.mouse.move).toHaveBeenLastCalledWith(400, 0);
  });
});
