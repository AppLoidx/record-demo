import { describe, expect, it } from "vitest";
import {
  compositionFrameAtOrAfterTime,
  compositionDurationInFrames,
  createTimeMap,
  timelineFrameForCompositionFrame,
  timeMapFramePieces,
} from "../lib/time-map";
import { cursorPosition } from "../lib/cursor-position";
import { createSceneCameraPath } from "../lib/scene-camera";
import { cursorVisibility } from "../remotion/Cursor";
import { transitionMotion } from "../remotion/Transition";
import type { Timeline } from "../lib/timeline";

function timeline(
  durationMs: number,
  events: Timeline["events"] = [],
): Timeline {
  return {
    version: 1,
    name: "time-map-test",
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
    capture: { fps: 30, syncFlashAt: 0 },
    durationMs,
    events,
  };
}

describe("createTimeMap", () => {
  it.each([
    {
      first: { t: 1.3333333333333333, cardMs: 1_200.4 },
      second: { t: 4_017.0666666666675, cardMs: 3_500 },
      expectedFrame: 341,
    },
    {
      first: { t: 0.03333333333333333, cardMs: 1_200.01 },
      second: { t: 3_366.676666666667, cardMs: 3_500 },
      expectedFrame: 301,
    },
  ])(
    "reuses the canonical cut boundary when retained-duration arithmetic differs by an ULP",
    ({ first, second, expectedFrame }) => {
      const map = createTimeMap(
        timeline(20_000, [
          {
            ...first,
            kind: "transition",
            label: "First",
            outMs: 450,
            visibleCardMs: 1_200,
            inMs: 500,
          },
          {
            ...second,
            kind: "transition",
            label: "Second",
            outMs: 450,
            visibleCardMs: 1_200,
            inMs: 500,
          },
        ]),
      );
      const boundaryMs = map.cuts[1]!.compositionAtMs;
      const pieceStartMs = map.pieces[2]!.compositionStartMs;

      expect(pieceStartMs).toBe(boundaryMs);
      expect(compositionFrameAtOrAfterTime(pieceStartMs, 60)).toBe(
        expectedFrame,
      );
      const framePieces = timeMapFramePieces(
        map,
        60,
        compositionDurationInFrames(
          timeline(20_000, [
            {
              ...first,
              kind: "transition",
              label: "First",
              outMs: 450,
              visibleCardMs: 1_200,
              inMs: 500,
            },
            {
              ...second,
              kind: "transition",
              label: "Second",
              outMs: 450,
              visibleCardMs: 1_200,
              inMs: 500,
            },
          ]),
          60,
        ),
      );
      for (const frame of [expectedFrame - 1, expectedFrame, expectedFrame + 1, 500]) {
        const piece = framePieces.find(
          (candidate) =>
            frame >= candidate.from &&
            frame < candidate.from + candidate.durationInFrames,
        )!;
        const reconstructedSourceFrame =
          piece.startFrom + frame - piece.from;
        expect(reconstructedSourceFrame).toBeCloseTo(
          timelineFrameForCompositionFrame(frame, 60, map),
        );
      }
    },
  );

  it("starts a source-video piece on the first frame actually after a fractional boundary", () => {
    const map = createTimeMap(
      timeline(20_000, [
        {
          t: 39.63333333333333,
          kind: "transition",
          label: "Fractional first cut",
          outMs: 450,
          cardMs: 1_200.8233333333333,
          visibleCardMs: 1_200,
          inMs: 500,
        },
        {
          t: 6_467.490000000001,
          kind: "transition",
          label: "Frame-edge second cut",
          outMs: 450,
          cardMs: 3_500,
          visibleCardMs: 1_200,
          inMs: 500,
        },
      ]),
    );
    const boundaryMs = map.cuts[1]!.compositionAtMs;

    expect(boundaryMs).toBe(8_116.666666666668);
    expect(Math.ceil((boundaryMs / 1_000) * 60)).toBe(487);
    expect((487 / 60) * 1_000).toBeLessThan(boundaryMs);
    expect(compositionFrameAtOrAfterTime(boundaryMs, 60)).toBe(488);
    expect(timelineFrameForCompositionFrame(487, 60, map)).toBeCloseTo(
      487.0494,
    );
    expect(timelineFrameForCompositionFrame(488, 60, map)).toBeCloseTo(
      626.0494,
    );
    const framePieces = timeMapFramePieces(
      map,
      60,
      compositionDurationInFrames(timeline(20_000), 60),
    );
    for (const frame of [487, 488, 489, 600]) {
      const piece = framePieces.find(
        (candidate) =>
          frame >= candidate.from &&
          frame < candidate.from + candidate.durationInFrames,
      )!;
      expect(piece.startFrom + frame - piece.from).toBeCloseTo(
        timelineFrameForCompositionFrame(frame, 60, map),
      );
    }
  });

  it("is an exact identity when there are no transition cuts", () => {
    const map = createTimeMap(timeline(10_001));

    expect(map.durationMs).toBe(10_001);
    expect(map.cuts).toEqual([]);
    expect(map.pieces).toEqual([
      {
        compositionStartMs: 0,
        compositionEndMs: 10_001,
        timelineStartMs: 0,
        timelineEndMs: 10_001,
      },
    ]);
    expect(map.toTimelineTime(1_234.567)).toBe(1_234.567);
    expect(map.toCompositionTime(1_234.567)).toBe(1_234.567);
    expect(map.toCompositionTime(-20)).toBe(-20);
    expect(map.toCompositionTime(10_101)).toBe(10_101);
    expect(timelineFrameForCompositionFrame(73, 60, map)).toBe(73);
  });

  it("removes two long card tails and jumps right-continuously", () => {
    const map = createTimeMap(
      timeline(12_000, [
        {
          t: 1_000,
          kind: "transition",
          label: "First",
          outMs: 400,
          cardMs: 3_000,
          visibleCardMs: 1_200,
          inMs: 500,
        },
        {
          t: 7_000,
          kind: "transition",
          label: "Second",
          outMs: 300,
          cardMs: 2_000,
          visibleCardMs: 800,
          inMs: 500,
        },
      ]),
    );

    expect(map.cuts).toEqual([
      { startMs: 2_600, endMs: 4_400, compositionAtMs: 2_600 },
      { startMs: 8_100, endMs: 9_300, compositionAtMs: 6_300 },
    ]);
    expect(map.durationMs).toBe(9_000);
    expect(map.toTimelineTime(2_599.5)).toBe(2_599.5);
    expect(map.toTimelineTime(2_600)).toBe(4_400);
    expect(map.toTimelineTime(6_299.5)).toBe(8_099.5);
    expect(map.toTimelineTime(6_300)).toBe(9_300);
    expect(map.toTimelineTime(9_000)).toBe(12_000);
  });

  it("unions overlapping cuts and clips them to useful timeline time", () => {
    const map = createTimeMap(
      timeline(8_000, [
        {
          t: 0,
          kind: "transition",
          label: "Overlap A",
          outMs: 1_000,
          cardMs: 4_000,
          visibleCardMs: 1_000,
          inMs: 0,
        },
        {
          t: 2_500,
          kind: "transition",
          label: "Overlap B",
          outMs: 0,
          cardMs: 4_000,
          visibleCardMs: 1_000,
          inMs: 0,
        },
        {
          t: 7_000,
          kind: "transition",
          label: "Past EOF",
          outMs: 0,
          cardMs: 4_000,
          visibleCardMs: 500,
          inMs: 0,
        },
      ]),
    );

    expect(map.cuts).toEqual([
      { startMs: 2_000, endMs: 6_500, compositionAtMs: 2_000 },
      { startMs: 7_500, endMs: 8_000, compositionAtMs: 3_000 },
    ]);
    expect(map.durationMs).toBe(3_000);
    expect(map.toTimelineTime(3_000)).toBe(8_000);
  });

  it("maps every source event inside a cut to the cut point and stays monotonic", () => {
    const map = createTimeMap(
      timeline(6_000, [
        {
          t: 1_000,
          kind: "transition",
          label: "Cut",
          outMs: 500,
          cardMs: 3_000,
          visibleCardMs: 1_000,
          inMs: 500,
        },
      ]),
    );

    expect([2_500, 3_000, 4_000, 4_500].map(map.toCompositionTime)).toEqual([
      2_500, 2_500, 2_500, 2_500,
    ]);
    const sourceTimes = Array.from({ length: 101 }, (_, index) =>
      map.toTimelineTime((map.durationMs * index) / 100),
    );
    expect(
      sourceTimes.every(
        (sourceTime, index) =>
          index === 0 || sourceTime >= sourceTimes[index - 1]!,
      ),
    ).toBe(true);
  });

  it("keeps fractional source-frame accuracy across a cut", () => {
    const map = createTimeMap(
      timeline(3_000, [
        {
          t: 500,
          kind: "transition",
          label: "Fractional",
          outMs: 125,
          cardMs: 775,
          visibleCardMs: 250,
          inMs: 0,
        },
      ]),
    );

    expect(timelineFrameForCompositionFrame(53, 60, map)).toBeCloseTo(84.5);
    expect(timelineFrameForCompositionFrame(38, 60, map)).toBe(38);
    expect(compositionDurationInFrames(timeline(3_000), 60)).toBe(180);
    expect(
      compositionDurationInFrames(
        timeline(3_000, [
          {
            t: 500,
            kind: "transition",
            label: "Fractional",
            outMs: 125,
            cardMs: 775,
            visibleCardMs: 250,
            inMs: 0,
          },
        ]),
        60,
      ),
    ).toBe(149);
  });

  it("keeps camera and cursor source motion continuous except at two hidden card jumps", () => {
    const subject = timeline(8_000, [
      { t: 0, kind: "cursor", x: 0, y: 100 },
      {
        t: 1_000,
        kind: "transition",
        label: "First cut",
        outMs: 0,
        cardMs: 2_000,
        visibleCardMs: 1_000,
        inMs: 500,
      },
      {
        t: 2_500,
        kind: "zoom",
        rect: { x: 700, y: 400, width: 400, height: 225 },
        durationMs: 1_650,
      },
      { t: 2_500, kind: "cursor", x: 250, y: 100 },
      { t: 4_000, kind: "cursor", x: 400, y: 100 },
      {
        t: 4_500,
        kind: "transition",
        label: "Second cut",
        outMs: 0,
        cardMs: 1_500,
        visibleCardMs: 500,
        inMs: 500,
      },
      {
        t: 5_500,
        kind: "zoom",
        rect: { x: 1_100, y: 650, width: 320, height: 180 },
        durationMs: 1_650,
      },
      { t: 5_500, kind: "cursor", x: 550, y: 100 },
      { t: 7_000, kind: "cursor", x: 700, y: 100 },
    ]);
    const map = createTimeMap(subject);
    const camera = createSceneCameraPath(subject, 60, 2_560, 1_440);
    const sourceFrames = Array.from(
      { length: compositionDurationInFrames(subject, 60) },
      (_, frame) => timelineFrameForCompositionFrame(frame, 60, map),
    );
    const leapFrames = sourceFrames.slice(1).flatMap((sourceFrame, index) =>
      sourceFrame - sourceFrames[index]! > 1.001 ? [index + 1] : [],
    );

    expect(leapFrames).toEqual([120, 240]);
    expect(sourceFrames.slice(117, 123)).toEqual([117, 118, 119, 180, 181, 182]);
    [297, 298, 299, 360, 361, 362].forEach((expected, index) => {
      expect(sourceFrames[237 + index]).toBeCloseTo(expected);
    });

    const compositionFrames = [119, 120, 121, 239, 240, 241];
    const expectedSourceFrames = [119, 180, 181, 299, 360, 361];
    compositionFrames.forEach((frame, index) => {
      const actual = camera.atFrame(sourceFrames[frame]!);
      const expected = camera.atFrame(expectedSourceFrames[index]!);
      expect(actual.scale).toBeCloseTo(expected.scale);
      expect(actual.translateX).toBeCloseTo(expected.translateX);
      expect(actual.translateY).toBeCloseTo(expected.translateY);
    });

    const cameraDistance = (leftFrame: number, rightFrame: number) => {
      const left = camera.atFrame(sourceFrames[leftFrame]!);
      const right = camera.atFrame(sourceFrames[rightFrame]!);
      return Math.hypot(
        right.scale - left.scale,
        right.translateX - left.translateX,
        right.translateY - left.translateY,
      );
    };
    expect(cameraDistance(119, 120)).toBeGreaterThan(
      cameraDistance(120, 121) * 10,
    );
    expect(cameraDistance(239, 240)).toBeGreaterThan(
      cameraDistance(240, 241) * 10,
    );

    const mappedCursorX = (frame: number) =>
      cursorPosition(
        subject,
        map.toTimelineTime((frame / 60) * 1_000),
      )?.x;
    expect(mappedCursorX(119)).toBeCloseTo(198.333333);
    expect(mappedCursorX(120)).toBe(300);
    expect(mappedCursorX(121)).toBeCloseTo(301.666667);
    expect(mappedCursorX(239)).toBeCloseTo(498.333333);
    expect(mappedCursorX(240)).toBe(600);
    expect(mappedCursorX(241)).toBeCloseTo(601.666667);

    const transitions = subject.events.filter(
      (event) => event.kind === "transition",
    );
    const projectedFirst = { ...transitions[0]!, t: 1_000, cardMs: 1_000 };
    const projectedSecond = { ...transitions[1]!, t: 3_500, cardMs: 500 };
    expect(transitionMotion(projectedFirst, 2_000).incoming.opacity).toBe(0);
    expect(transitionMotion(projectedSecond, 4_000).incoming.opacity).toBe(0);
    expect(cursorVisibility(subject, 3_000)).toBe(0);
    expect(cursorVisibility(subject, 6_000)).toBe(0);
  });
});
