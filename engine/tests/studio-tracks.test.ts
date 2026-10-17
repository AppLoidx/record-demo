import { describe, expect, it } from "vitest";
import fixtureTimeline from "../fixtures/timeline.json";
import type { Timeline } from "../lib/timeline";
import { buildStudioTracks } from "../remotion/DemoVideo";
import { msToFrameWindow } from "../remotion/theme";
import { createCameraPath } from "../lib/camera";

describe("buildStudioTracks", () => {
  it("projects tracks through a card cut and shortens spans crossing it", () => {
    const timeline: Timeline = {
      ...(fixtureTimeline as Timeline),
      durationMs: 8_000,
      events: [
        { t: 0, kind: "role", label: "Customer" },
        {
          t: 1_000,
          kind: "transition",
          label: "Switch app",
          outMs: 500,
          cardMs: 3_000,
          visibleCardMs: 1_000,
          inMs: 500,
        },
        {
          t: 2_000,
          kind: "caption",
          text: "This caption crosses the hidden tail",
          durationMs: 4_000,
        },
        { t: 3_000, kind: "role", label: "Ops" },
        {
          t: 5_000,
          kind: "window",
          image: "window.png",
          imageWidth: 800,
          imageHeight: 600,
          enterMs: 100,
          holdMs: 200,
          exitMs: 100,
        },
      ],
    };

    const tracks = buildStudioTracks(timeline, 60, 360);

    expect(tracks.transitions[0]).toMatchObject({
      from: 60,
      durationInFrames: 121,
      event: { t: 1_000, cardMs: 1_000 },
    });
    expect(tracks.captions[0]).toMatchObject({
      from: 120,
      durationInFrames: 121,
    });
    expect(tracks.windows[0]).toMatchObject({
      from: 180,
      durationInFrames: 25,
    });
    expect(tracks.roles[1]).toMatchObject({
      from: 150,
      durationInFrames: 211,
    });
  });

  it("uses the rendered auto duration for zoom tracks at each output aspect", () => {
    const timeline: Timeline = {
      ...(fixtureTimeline as Timeline),
      events: [
        {
          t: 200,
          kind: "zoom",
          rect: { x: 800, y: 400, width: 400, height: 225 },
        },
      ],
    };
    for (const [width, height] of [
      [2_560, 1_440],
      [1_440, 1_440],
      [1_080, 1_920],
    ]) {
      const path = createCameraPath(timeline, 60, width!, height!);
      const tracks = buildStudioTracks(timeline, 60, 120, path);
      expect(tracks.zooms[0]).toMatchObject(
        msToFrameWindow(200, path.moves[0]!.durationMs, 60),
      );
    }
  });

  it("describes one correctly named and timed track per fixture event", () => {
    const tracks = buildStudioTracks(fixtureTimeline as Timeline, 60, 120);

    expect(tracks.screen).toEqual({
      name: "Screen",
      from: 0,
      durationInFrames: 120,
    });
    expect(
      tracks.captions.map(({ event: _event, ...track }) => track),
    ).toEqual([
      {
        name: 'Caption: "Every workflow starts in con"',
        from: 0,
        durationInFrames: 55,
      },
      {
        name: 'Caption: "Focus follows the feature be"',
        from: 56,
        durationInFrames: 54,
      },
    ]);
    expect(
      tracks.spotlights.map(({ event: _event, ...track }) => track),
    ).toEqual([
      {
        name: "Spotlight",
        from: 58,
        durationInFrames: 60,
      },
    ]);
    expect(tracks.zooms.map(({ event: _event, ...track }) => track)).toEqual([
      { name: "Zoom in", from: 38, durationInFrames: 99 },
      { name: "Zoom out", from: 87, durationInFrames: 100 },
    ]);
    expect(tracks.outro).toBeUndefined();
  });

  it("spans an outro from its rounded start frame through the video end", () => {
    const timeline: Timeline = {
      ...(fixtureTimeline as Timeline),
      durationMs: 2_500,
      events: [
        ...(fixtureTimeline.events as Timeline["events"]),
        {
          t: 2_000,
          kind: "outro",
          title: "Any website. One storyboard.",
          durationMs: 500,
        },
      ],
    };

    const outro = buildStudioTracks(timeline, 60, 180).outro;
    const track = outro && { ...outro, event: undefined };

    expect(track).toEqual({
      name: 'Outro: "Any website. One storyboard."',
      from: 120,
      durationInFrames: 60,
      event: undefined,
    });
  });

  it.each([
    {
      name: "integral caption",
      kind: "caption",
      t: 1_000,
      durationMs: 1_000,
      fps: 60,
      compositionFrames: 180,
    },
    {
      name: "fractional frame boundaries",
      kind: "caption",
      t: 125,
      durationMs: 775,
      fps: 30,
      compositionFrames: 60,
    },
    {
      name: "single instant",
      kind: "caption",
      t: 333,
      durationMs: 0,
      fps: 24,
      compositionFrames: 24,
    },
    {
      name: "zero-transition spotlight",
      kind: "spotlight",
      t: 1_000,
      durationMs: 0,
      holdMs: 2_000,
      fps: 60,
      compositionFrames: 240,
    },
  ] as const)(
    "contains every old-style active frame for $name",
    (testCase) => {
      const { t, durationMs, fps, compositionFrames } = testCase;
      const activeDurationMs =
        testCase.kind === "spotlight"
          ? durationMs * 2 + testCase.holdMs
          : durationMs;
      const window = msToFrameWindow(t, activeDurationMs, fps);

      for (let frame = 0; frame < compositionFrames; frame += 1) {
        const timeMs = (frame / fps) * 1_000;
        const oldStyleVisible =
          t <= timeMs && t + activeDurationMs >= timeMs;
        const insideSequence =
          frame >= window.from &&
          frame < window.from + window.durationInFrames;

        if (oldStyleVisible) {
          expect(insideSequence, `frame ${frame}`).toBe(true);
        }
      }
    },
  );
});
