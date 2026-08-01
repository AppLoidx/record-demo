import { describe, expect, it } from "vitest";
import fixtureTimeline from "../fixtures/timeline.json";
import type { Timeline } from "../lib/timeline";
import { buildStudioTracks } from "../remotion/DemoVideo";

describe("buildStudioTracks", () => {
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
        durationInFrames: 54,
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
      { name: "Zoom in", from: 38, durationInFrames: 26 },
      { name: "Zoom out", from: 87, durationInFrames: 21 },
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

    const outro = buildStudioTracks(timeline, 60, 150).outro;
    const track = outro && { ...outro, event: undefined };

    expect(track).toEqual({
      name: 'Outro: "Any website. One storyboard."',
      from: 120,
      durationInFrames: 30,
      event: undefined,
    });
  });
});
