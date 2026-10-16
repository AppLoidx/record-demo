import type { Page } from "@playwright/test";
import { Easing } from "remotion";
import { demoTheme } from "../remotion/theme";

export type CursorPoint = { x: number; y: number };

const motion = demoTheme.cursor;
const ease = Easing.bezier(...motion.moveEasing);

export function cursorDurationMs(distance: number, targetSize: number) {
  if (distance < motion.minimumMoveDistance) return 0;
  const duration =
    motion.moveBaseDurationMs +
    motion.moveDistanceDurationMs *
      Math.log2(
        1 + distance / Math.max(motion.minimumTargetSize, targetSize),
      );
  return Math.min(
    motion.maximumMoveDurationMs,
    Math.max(motion.minimumMoveDurationMs, duration),
  );
}

export function cursorPath(
  from: CursorPoint,
  to: CursorPoint,
  steps: number,
): CursorPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < motion.minimumMoveDistance) return [];
  const offset = Math.min(
    motion.arcDistanceRatio * distance,
    motion.maximumArcOffset,
  );
  const control = {
    x: (from.x + to.x) / 2 - (dy / distance) * offset,
    y: (from.y + to.y) / 2 + (dx / distance) * offset,
  };
  return Array.from({ length: steps }, (_, index) => {
    if (index === steps - 1) return { ...to };
    const progress = ease((index + 1) / steps);
    const remaining = 1 - progress;

    return {
      x:
        remaining ** 2 * from.x +
        2 * remaining * progress * control.x +
        progress ** 2 * to.x,
      y:
        remaining ** 2 * from.y +
        2 * remaining * progress * control.y +
        progress ** 2 * to.y,
    };
  });
}

export async function moveCursor(
  page: Page,
  from: CursorPoint,
  to: CursorPoint,
  onMove: (point: CursorPoint) => void,
  targetSize: number = motion.minimumTargetSize,
) {
  const durationMs = cursorDurationMs(
    Math.hypot(to.x - from.x, to.y - from.y),
    targetSize,
  );
  if (durationMs === 0) return;
  const steps = Math.ceil(durationMs / (1000 / motion.sampleFps));
  const startedAt = performance.now();

  for (const [index, point] of cursorPath(from, to, steps).entries()) {
    const targetElapsedMs = (durationMs * (index + 1)) / steps;
    const delayMs = targetElapsedMs - (performance.now() - startedAt);
    if (delayMs > 0) await page.waitForTimeout(delayMs);

    await page.mouse.move(point.x, point.y);
    onMove(point);
  }
}
