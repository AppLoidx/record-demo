import type { Page } from "@playwright/test";

export type CursorPoint = { x: number; y: number };

const MOVE_DURATION_MS = 500;
const FRAME_MS = 1000 / 60;

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export function cursorPath(
  from: CursorPoint,
  to: CursorPoint,
  steps: number,
): CursorPoint[] {
  return Array.from({ length: steps }, (_, index) => {
    const progress = easeInOutCubic((index + 1) / steps);

    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  });
}

export async function moveCursor(
  page: Page,
  from: CursorPoint,
  to: CursorPoint,
  onMove: (point: CursorPoint) => void,
) {
  const steps = Math.ceil(MOVE_DURATION_MS / FRAME_MS);
  const startedAt = performance.now();

  for (const [index, point] of cursorPath(from, to, steps).entries()) {
    const targetElapsedMs = (MOVE_DURATION_MS * (index + 1)) / steps;
    const delayMs = targetElapsedMs - (performance.now() - startedAt);
    if (delayMs > 0) await page.waitForTimeout(delayMs);

    await page.mouse.move(point.x, point.y);
    onMove(point);
  }
}
