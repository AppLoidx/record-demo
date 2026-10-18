import { describe, expect, it } from "vitest";
import { buildSoundCues } from "../lib/sound-cues";
import { carryFlights, carryTiming } from "../lib/carry";
import { createTimeMap } from "../lib/time-map";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { demoTheme } from "../remotion/theme";

const rect = { x: 10, y: 20, width: 100, height: 50 };
const transition: TimelineEvent = { t: 1000, kind: "transition", style: "cut", label: "Next", outMs: 0, cardMs: 2000, inMs: 300 };
function timeline(events: TimelineEvent[], durationMs = 10000): Timeline {
  return { version: 1, name: "sound", viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }, capture: { fps: 60, syncFlashAt: 0 }, durationMs, events };
}

describe("buildSoundCues", () => {
  it("maps visible actions and excludes actions during hidden cut time", () => {
    const result = buildSoundCues(timeline([
      transition,
      { t: 1500, kind: "click", x: 1, y: 2 },
      { t: 3500, kind: "click", x: 1, y: 2 },
      { t: 4000, kind: "window", image: "x", imageWidth: 1, imageHeight: 1, holdMs: 500, enterMs: 100, exitMs: 100 },
    ]));
    expect(result.durationMs).toBe(8000);
    expect(result.cues).toEqual([
      { timeMs: 1000, kind: "whoosh", reason: "scene-change", major: true },
      { timeMs: 1500, kind: "click", reason: "click" },
      { timeMs: 2000, kind: "whoosh", reason: "window-open" },
    ]);
    expect(result.endCardMs).toBeNull();
  });

  it("splits typing across hidden intervals, clips boundaries, and prefers measured events", () => {
    const source = timeline([transition, { t: 500, kind: "type", durationMs: 3000, chars: 25 }]);
    expect(buildSoundCues(source, [{ startMs: 7000, endMs: 8000 }]).cues.filter((c) => c.kind === "typing")).toEqual([
      { timeMs: 500, durationMs: 500, kind: "typing", reason: "type-event" },
      { timeMs: 1000, durationMs: 500, kind: "typing", reason: "type-event" },
    ]);
    const legacy = buildSoundCues(timeline([transition]), [{ startMs: -100, endMs: 12000 }]);
    expect(legacy.cues.filter((c) => c.kind === "typing").map((c) => [c.timeMs, c.durationMs])).toEqual([[0, 1000], [1000, 7000]]);
    expect(buildSoundCues(timeline([{ t: 200, kind: "type", durationMs: 0, chars: 1 }])).cues).toEqual([]);
  });

  it("rejects malformed legacy typing intervals", () => {
    expect(() => buildSoundCues(timeline([]), [{ startMs: 100, endMs: 99 }])).toThrow(/Typing spans/);
    expect(() => buildSoundCues(timeline([]), [{ startMs: NaN, endMs: 100 }])).toThrow(/Typing spans/);
  });

  it("suppresses nearby discrete cues by priority, preserving a cue exactly 120 ms away", () => {
    const result = buildSoundCues(timeline([
      { t: 0, kind: "rail", steps: ["A", "B"], active: 0 },
      { t: 900, kind: "click", x: 1, y: 2 },
      { t: 950, kind: "rail", steps: ["A", "B"], active: 1 },
      transition,
      { t: 3120, kind: "click", x: 1, y: 2 },
      { t: 4000, kind: "rail-back", from: 1, to: 0 },
      { t: 4050, kind: "click", x: 1, y: 2 },
      { t: 4500, kind: "click", x: 1, y: 2 },
      { t: 4550, kind: "click", x: 1, y: 2 },
    ]));
    expect(result.cues.map((c) => [c.timeMs, c.kind])).toEqual([[1000, "whoosh"], [1120, "click"], [2000, "pop"], [2500, "click"]]);
  });

  it("uses renderer carry flight and arrival times without double mapping", () => {
    const source = timeline([
      { t: 500, kind: "carry", rect, text: "Funds" }, transition,
      { t: 3500, kind: "land", rect },
    ]);
    const timings = carryTiming(carryFlights(source)[0]!);
    const result = buildSoundCues(source);
    expect(result.cues).toContainEqual({ timeMs: timings.flightStartMs, kind: "whoosh", reason: "carry-flight" });
    expect(result.cues).toContainEqual({ timeMs: timings.arrivalMs, kind: "pop", reason: "carry-landing" });
    expect(timings.flightStartMs).toBe(1500);
  });

  it("marks the actual outro title entrance as major and reports end card start", () => {
    const source = timeline([transition, { t: 7000, kind: "outro", title: "Done", durationMs: 2400 }]);
    const delay = Math.min(demoTheme.outro.titleDelayMs, 2400 - demoTheme.outro.holdMs - demoTheme.transition.wordMs);
    const result = buildSoundCues(source);
    expect(result.endCardMs).toBe(5000);
    expect(result.cues).toContainEqual({ timeMs: 5000 + delay, kind: "pop", reason: "outro-title", major: true });
  });

  it("leaves input timeline unchanged", () => {
    const source = timeline([transition, { t: 4000, kind: "type", durationMs: 500, chars: 10 }]);
    const before = structuredClone(source);
    buildSoundCues(source);
    expect(source).toEqual(before);
    expect(createTimeMap(source).durationMs).toBe(8000);
  });
});
