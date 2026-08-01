import { describe, expect, it } from "vitest";
import {
  parseTimeline,
  serializeTimeline,
  type Timeline,
  type TimelineEvent,
} from "../lib/timeline";

type SpotlightEvent = Extract<TimelineEvent, { kind: "spotlight" }>;

describe("timeline serialization", () => {
  it("round-trips every timeline event kind", () => {
    const timeline: Timeline = {
      version: 1,
      name: "fictional-feature",
      viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
      capture: { fps: 30, syncFlashAt: 83.33 },
      durationMs: 2400,
      events: [
        { t: 0, kind: "caption", text: "Open the feature", durationMs: 800 },
        { t: 250, kind: "cursor", x: 320, y: 240 },
        { t: 750, kind: "click", x: 480, y: 320 },
        {
          t: 900,
          kind: "zoom",
          rect: { x: 100, y: 120, width: 640, height: 360 },
          durationMs: 500,
        },
        {
          t: 1100,
          kind: "spotlight",
          rect: { x: 120, y: 140, width: 360, height: 180 },
          durationMs: 450,
          holdMs: 800,
        },
        { t: 1800, kind: "zoom", rect: null, durationMs: 400 },
        {
          t: 2_000,
          kind: "outro",
          title: "Any website. One storyboard.",
          durationMs: 400,
        },
      ],
    };

    expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
  });

  it.each([
    ["durationMs", (event: SpotlightEvent) => (event.durationMs = -1)],
    ["holdMs", (event: SpotlightEvent) => (event.holdMs = -1)],
    ["rect width", (event: SpotlightEvent) => (event.rect.width = -1)],
    ["rect height", (event: SpotlightEvent) => (event.rect.height = -1)],
  ])("rejects a negative spotlight %s", (_field, makeInvalid) => {
    const event: SpotlightEvent = {
      t: 100,
      kind: "spotlight",
      rect: { x: 120, y: 140, width: 360, height: 180 },
      durationMs: 450,
      holdMs: 800,
    };
    makeInvalid(event);

    expect(() =>
      parseTimeline(
        JSON.stringify({
          version: 1,
          name: "invalid-spotlight",
          viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
          capture: { fps: 30, syncFlashAt: 0 },
          durationMs: 1_000,
          events: [event],
        }),
      ),
    ).toThrow("Invalid demo timeline");
  });

  it("rejects more than one outro", () => {
    expect(() =>
      parseTimeline(
        JSON.stringify({
          version: 1,
          name: "duplicate-outro",
          viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
          capture: { fps: 30, syncFlashAt: 0 },
          durationMs: 4_800,
          events: [
            { t: 0, kind: "outro", title: "First", durationMs: 2_400 },
            { t: 2_400, kind: "outro", title: "Second", durationMs: 2_400 },
          ],
        }),
      ),
    ).toThrow("Invalid demo timeline");
  });

  it("rejects a negative outro duration", () => {
    expect(() =>
      parseTimeline(
        JSON.stringify({
          version: 1,
          name: "invalid-outro",
          viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
          capture: { fps: 30, syncFlashAt: 0 },
          durationMs: 1_000,
          events: [
            { t: 0, kind: "outro", title: "End", durationMs: -1 },
          ],
        }),
      ),
    ).toThrow("Invalid demo timeline");
  });
});
