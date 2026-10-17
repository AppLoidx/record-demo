import { demoTheme } from "../remotion/theme.ts";
import type { Timeline, TransitionEvent } from "./timeline";

export type TimeCut = {
  startMs: number;
  endMs: number;
  compositionAtMs: number;
};

export type TimePiece = {
  compositionStartMs: number;
  compositionEndMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
};

export type TimeMap = {
  durationMs: number;
  cuts: readonly TimeCut[];
  pieces: readonly TimePiece[];
  toTimelineTime: (compositionMs: number) => number;
  toCompositionTime: (timelineMs: number) => number;
};

export function transitionVisibleCardMs(event: TransitionEvent) {
  if (event.style === "cut") return 0;
  return Math.min(
    event.cardMs,
    event.visibleCardMs ?? demoTheme.transition.visibleCardMs,
  );
}

export function createTimeMap(timeline: Timeline): TimeMap {
  const rawCuts = timeline.events
    .filter((event): event is TransitionEvent => event.kind === "transition")
    .map((event) => ({
      startMs: Math.min(
        timeline.durationMs,
        Math.max(0, event.t + event.outMs + transitionVisibleCardMs(event)),
      ),
      endMs: Math.min(
        timeline.durationMs,
        Math.max(0, event.t + event.outMs + event.cardMs),
      ),
    }))
    .filter((cut) => cut.endMs > cut.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  const unioned: Array<{ startMs: number; endMs: number }> = [];
  for (const cut of rawCuts) {
    const previous = unioned.at(-1);
    if (previous && cut.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, cut.endMs);
    } else {
      unioned.push({ ...cut });
    }
  }

  let removedMs = 0;
  const cuts: TimeCut[] = unioned.map((cut) => {
    const compositionAtMs = cut.startMs - removedMs;
    removedMs += cut.endMs - cut.startMs;
    return { ...cut, compositionAtMs };
  });
  const durationMs = Math.max(0, timeline.durationMs - removedMs);

  const pieces: TimePiece[] = [];
  let timelineStartMs = 0;
  let compositionStartMs = 0;
  for (const cut of cuts) {
    if (cut.startMs > timelineStartMs) {
      pieces.push({
        compositionStartMs,
        compositionEndMs: cut.compositionAtMs,
        timelineStartMs,
        timelineEndMs: cut.startMs,
      });
    }
    timelineStartMs = cut.endMs;
    compositionStartMs = cut.compositionAtMs;
  }
  if (timelineStartMs < timeline.durationMs || pieces.length === 0) {
    pieces.push({
      compositionStartMs,
      compositionEndMs: durationMs,
      timelineStartMs,
      timelineEndMs: timeline.durationMs,
    });
  }

  return {
    durationMs,
    cuts,
    pieces,
    toTimelineTime(compositionMs: number) {
      let result = compositionMs;
      for (const cut of cuts) {
        if (compositionMs < cut.compositionAtMs) break;
        result += cut.endMs - cut.startMs;
      }
      return result;
    },
    toCompositionTime(timelineMs: number) {
      let removedBeforeMs = 0;
      for (const cut of cuts) {
        if (timelineMs < cut.startMs) break;
        if (timelineMs <= cut.endMs) return cut.compositionAtMs;
        removedBeforeMs += cut.endMs - cut.startMs;
      }
      return timelineMs - removedBeforeMs;
    },
  };
}

export function compositionDurationInFrames(timeline: Timeline, fps: number) {
  return Math.max(1, Math.ceil((createTimeMap(timeline).durationMs / 1_000) * fps));
}

export function compositionFrameAtOrAfterTime(timeMs: number, fps: number) {
  let frame = Math.ceil((timeMs / 1_000) * fps);
  while ((frame / fps) * 1_000 < timeMs) frame += 1;
  while (((frame - 1) / fps) * 1_000 >= timeMs) frame -= 1;
  return frame;
}

export type TimeMapFramePiece = {
  from: number;
  durationInFrames: number;
  startFrom: number;
};

export function timeMapFramePieces(
  timeMap: TimeMap,
  fps: number,
  durationInFrames: number,
): TimeMapFramePiece[] {
  const starts = timeMap.pieces.map((piece) =>
    compositionFrameAtOrAfterTime(piece.compositionStartMs, fps),
  );
  return timeMap.pieces.flatMap((_piece, index) => {
    const from = starts[index]!;
    const until = starts[index + 1] ?? durationInFrames;
    return until <= from
      ? []
      : [{
          from,
          durationInFrames: until - from,
          startFrom: timelineFrameForCompositionFrame(from, fps, timeMap),
        }];
  });
}

export function timelineFrameForCompositionFrame(
  frame: number,
  fps: number,
  timeMap: TimeMap,
) {
  if (timeMap.cuts.length === 0) return frame;
  return (timeMap.toTimelineTime((frame / fps) * 1_000) / 1_000) * fps;
}
