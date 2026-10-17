import { describe, expect, it } from "vitest";
import fixtureTimeline from "../fixtures/timeline.json";
import { parseTimeline, serializeTimeline, type Timeline } from "../lib/timeline";
import { demoVideoSchema } from "../remotion/schema";

const everyEventTimeline: Timeline = {
  version: 1,
  name: "every-event",
  viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
  capture: { fps: 30, syncFlashAt: 66.67 },
  durationMs: 5_000,
  events: [
    { t: 0, kind: "cursor", x: 120, y: 240 },
    { t: 250, kind: "click", x: 120, y: 240 },
    { t: 500, kind: "caption", text: "Open settings", durationMs: 800 },
    {
      t: 1_000,
      kind: "zoom",
      rect: { x: 100, y: 120, width: 640, height: 360 },
      durationMs: 1_650,
    },
    {
      t: 2_000,
      kind: "spotlight",
      rect: { x: 160, y: 180, width: 320, height: 180 },
      durationMs: 500,
      holdMs: 900,
    },
    { t: 4_000, kind: "outro", title: "Finished", durationMs: 1_000 },
  ],
};

function propsFor(timeline: unknown) {
  return {
    timeline,
    videoSrc: "every-event-trimmed-master.mp4",
    windowChrome: "macos",
  };
}

describe("demoVideoSchema", () => {
  it.each([undefined, 0, 725, 2_000])(
    "round-trips transition visibleCardMs %s through both schemas",
    (visibleCardMs) => {
      const timeline: Timeline = {
        ...everyEventTimeline,
        events: [
          {
            t: 100,
            kind: "transition",
            label: "Next",
            outMs: 450,
            cardMs: 2_000,
            ...(visibleCardMs === undefined ? {} : { visibleCardMs }),
            inMs: 560,
          },
        ],
      };
      expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
      expect(demoVideoSchema.parse(propsFor(timeline)).timeline).toEqual(
        timeline,
      );
    },
  );

  it("rejects a negative transition visibleCardMs", () => {
    const timeline = {
      ...everyEventTimeline,
      events: [
        {
          t: 100,
          kind: "transition",
          label: "Next",
          outMs: 450,
          cardMs: 2_000,
          visibleCardMs: -1,
          inMs: 560,
        },
      ],
    };
    expect(() => parseTimeline(JSON.stringify(timeline))).toThrow();
    expect(demoVideoSchema.safeParse(propsFor(timeline)).success).toBe(false);
  });

  it.each([undefined, 0, 1_200, 3_000])(
    "round-trips zoom duration %s through both schemas",
    (durationMs) => {
      const timeline: Timeline = {
        ...everyEventTimeline,
        events: [
          {
            t: 0,
            kind: "zoom",
            rect: null,
            ...(durationMs === undefined ? {} : { durationMs }),
          },
        ],
      };
      expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
      expect(demoVideoSchema.parse(propsFor(timeline)).timeline).toEqual(
        timeline,
      );
    },
  );

  it("accepts the fixture timeline", () => {
    expect(demoVideoSchema.safeParse(propsFor(fixtureTimeline)).success).toBe(
      true,
    );
  });

  it("accepts a timeline containing every event kind", () => {
    expect(
      demoVideoSchema.safeParse(propsFor(everyEventTimeline)).success,
    ).toBe(true);
  });

  it("rejects an unknown event kind", () => {
    const timeline = structuredClone(everyEventTimeline) as unknown as {
      events: Array<Record<string, unknown>>;
    };
    timeline.events[0] = { t: 0, kind: "pan", x: 120, y: 240 };

    expect(demoVideoSchema.safeParse(propsFor(timeline)).success).toBe(false);
  });

  it("rejects a second outro", () => {
    const timeline = structuredClone(everyEventTimeline);
    timeline.events.push({
      t: 4_500,
      kind: "outro",
      title: "Finished again",
      durationMs: 500,
    });

    expect(demoVideoSchema.safeParse(propsFor(timeline)).success).toBe(false);
  });
});
