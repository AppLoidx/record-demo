import type { Timeline, TimelineEvent } from "./timeline";

export type CursorPoint = Extract<TimelineEvent, { kind: "cursor" }>;

export function cursorPositionFromPoints(
  points: readonly CursorPoint[],
  timeMs: number,
) {
  if (points.length === 0 || timeMs < points[0]!.t) {
    return null;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    if (timeMs <= next.t) {
      const span = Math.max(1, next.t - current.t);
      const progress = (timeMs - current.t) / span;
      return {
        x: current.x + (next.x - current.x) * progress,
        y: current.y + (next.y - current.y) * progress,
        firstAt: points[0]!.t,
      };
    }
  }

  const last = points.at(-1)!;
  return { x: last.x, y: last.y, firstAt: points[0]!.t };
}

export function cursorPosition(timeline: Timeline, timeMs: number) {
  const points = timeline.events.filter((event) => event.kind === "cursor");
  return cursorPositionFromPoints(points, timeMs);
}
