import { describe, expect, it } from "vitest";
import fixture from "../fixtures/timeline.json";
import { calloutSide, calloutPlacement } from "../lib/callout";
import { exitWordTimings, wordTimings } from "../lib/typography";
import { calloutTotalDuration, parseTimeline, serializeTimeline, type Timeline, type CalloutEvent } from "../lib/timeline";
import { chapterProgress } from "../remotion/Transition";
import { cursorVisibility } from "../remotion/Cursor";
import { roleBadgeState, roleBadgeTop, roleLayers, roleWidth } from "../remotion/RoleBadge";
import { windowPlacement } from "../remotion/WindowInset";
import { compositionPresets, demoTheme } from "../remotion/theme";
import { buildStudioTracks, layoutFor } from "../remotion/DemoVideo";
import { demoVideoSchema } from "../remotion/schema";
import { computeFrameSheets } from "../scripts/frame-sheets.mjs";
import { detectDeadAirSpans } from "../scripts/score-motion.mjs";

const transition = { t: 1000, kind: "transition" as const, label: "Review the request", role: "Ops", chapter: { index: 2, total: 5 },
  outMs: 450, cardMs: 1500, inMs: 560 };
const windowEvent = { t: 5000, kind: "window" as const, image: "email.png", imageWidth: 1140, imageHeight: 1800,
  enterMs: 520, holdMs: 1800, exitMs: 320 };
const timeline: Timeline = { ...fixture as Timeline, durationMs: 15000, events: [transition, windowEvent] };

describe("role badge", () => {
  const roles: Timeline = { ...timeline, events: [{ t: 0, kind: "role", label: "Customer" }, { t: 1000, kind: "role", label: "Ops" }] };
  it("uses one interpolated pill width and never has two readable label layers", () => {
    const from = roleWidth("Customer"), to = roleWidth("Ops");
    expect(roleBadgeState(roles, 1000).width).toBe(from);
    expect(roleBadgeState(roles, 1360).width).toBe(to);
    expect(roleBadgeState(roles, 1180).width).toBeGreaterThan(to);
    expect(roleBadgeState(roles, 1180).width).toBeLessThan(from);
    for (let age = 0; age <= 360; age += 1) {
      expect(roleLayers(roles, 1000 + age, 0).filter((layer) => layer.opacity > 0.15).length).toBeLessThanOrEqual(1);
    }
    expect(roleLayers(roles, 1090, 0)[0]!.y).toBeLessThan(0);
    expect(roleLayers(roles, 1270, 0).at(-1)!.y).toBeGreaterThan(0);
  });
});

describe("main cursor visibility", () => {
  it.each([1000, 1200, 1450, 2000, 2949, 2950, 3200, 3509, 5000, 5259, 5520, 6500, 7320, 7500, 7639])("hides at %sms inside each transition and window phase", (time) => {
    expect(cursorVisibility(timeline, time)).toBe(0);
  });
  it.each([3510, 7640])("returns over 150ms after the effect ends at %s", (end) => {
    expect(cursorVisibility(timeline, end)).toBe(0);
    expect(cursorVisibility(timeline, end + 75)).toBeCloseTo(0.5);
    expect(cursorVisibility(timeline, end + 150)).toBe(1);
  });
  it("has no effect on old timelines and hides across adjoining effects", () => {
    expect(cursorVisibility(fixture as Timeline, 1000)).toBe(1);
    expect(cursorVisibility({ ...timeline, events: [transition, { ...windowEvent, t: 3510 }] }, 3550)).toBe(0);
  });
});

describe("kinetic word timing and stepper", () => {
  it("staggered words have exact start/end and cap to the available card budget", () => {
    expect(wordTimings(3, 45, 420, 980)).toEqual([
      { startMs: 0, endMs: 420 }, { startMs: 45, endMs: 465 }, { startMs: 90, endMs: 510 },
    ]);
    expect(wordTimings(100, 45, 420, 980).at(-1)!.endMs).toBeCloseTo(980);
    expect(wordTimings(100, 30, 260, 450).at(-1)!.endMs).toBeCloseTo(450);
    expect(wordTimings(1, 30, 260, 450)).toEqual([{ startMs: 0, endMs: 260 }]);
    expect(wordTimings(3, 45, 420, 100).at(-1)!.endMs).toBe(100);
  });
  it("fits reverse 25ms exit staggers within the final 260ms", () => {
    expect(exitWordTimings(3, 25, 260)).toEqual([
      { startMs: 0, endMs: 210 }, { startMs: 25, endMs: 235 }, { startMs: 50, endMs: 260 },
    ]);
    expect(exitWordTimings(100, 25, 260).at(-1)!.endMs).toBeCloseTo(260);
  });
  it("draws the hairline before filling the current segment", () => {
    expect(chapterProgress(transition, 420)).toMatchObject({ line: 0, current: 0 });
    expect(chapterProgress(transition, 600).line).toBeGreaterThan(0);
    expect(chapterProgress(transition, 600).current).toBe(0);
    expect(chapterProgress(transition, 780)).toMatchObject({ line: 1, current: 0 });
    expect(chapterProgress(transition, 1010).current).toBeCloseTo(0.5);
    expect(chapterProgress(transition, 1240)).toMatchObject({ line: 1, current: 1, opacity: 1 });
    expect(chapterProgress(transition, 1500).opacity).toBe(0);
  });
});

const callout: CalloutEvent = { t: 0, kind: "callout", rect: { x: 100, y: 100, width: 240, height: 60 },
  text: "Ready for review", holdMs: 5000, side: "right" };
describe("callout integration", () => {
  it.each(compositionPresets)("picks space and flips to fit $id", ({ width, height }) => {
    const r = { x: width - 100, y: height / 2, width: 60, height: 40 };
    expect(calloutSide(r, width, height)).toBe("left");
    const p = calloutPlacement(r, callout.text, "right", width, height);
    expect(p.side).toBe("left");
    for (const rect of [r, { x: 10, y: 10, width: 30, height: 30 }, { x: width / 2, y: height - 40, width: 30, height: 30 }]) {
      for (const side of ["left", "right", "top", "bottom"] as const) {
        const fit = calloutPlacement(rect, callout.text, side, width, height);
        expect(fit.x).toBeGreaterThanOrEqual(demoTheme.callout.margin);
        expect(fit.y).toBeGreaterThanOrEqual(demoTheme.callout.margin);
        expect(fit.x + fit.width).toBeLessThanOrEqual(width - demoTheme.callout.margin);
        expect(fit.y + fit.height).toBeLessThanOrEqual(height - demoTheme.callout.margin);
      }
    }
  });
  it("round-trips optional chapter and callout fields and leaves legacy timelines unchanged", () => {
    for (const subject of [{ ...timeline, events: [transition, callout] }, fixture as Timeline]) {
      expect(parseTimeline(serializeTimeline(subject))).toEqual(subject);
      expect(demoVideoSchema.parse({ timeline: subject, videoSrc: "clip.mp4", windowChrome: "none" }).timeline).toEqual(subject);
    }
    for (const chapter of [{ index: 0, total: 5 }, { index: 6, total: 5 }, { index: 1.5, total: 5 }]) {
      expect(() => parseTimeline(JSON.stringify({ ...timeline, events: [{ ...transition, chapter }] }))).toThrow();
      expect(demoVideoSchema.safeParse({ timeline: { ...timeline, events: [{ ...transition, chapter }] }, videoSrc: "clip.mp4", windowChrome: "none" }).success).toBe(false);
    }
  });
  it("adds Studio and frame-sheet spans, and treats the whole callout lifetime as content", () => {
    const subject = { ...timeline, durationMs: calloutTotalDuration(callout) + 1000, events: [callout] };
    expect(buildStudioTracks(subject, 60, 900).callouts[0]).toMatchObject({ name: "Callout: Ready for review", from: 0 });
    expect(computeFrameSheets(subject, subject.durationMs)).toMatchObject([{ kind: "callout", startMs: 0, endMs: calloutTotalDuration(callout) + 500 }]);
    expect(detectDeadAirSpans(subject)).toEqual([]);
  });
});

it.each(compositionPresets)("fits the whole tall inset in 86% of $id", ({ width, height }) => {
  const p = windowPlacement(windowEvent, width, height);
  expect(p.height).toBeLessThanOrEqual(height * 0.86 + 1e-6);
  expect(p.height).toBeCloseTo(demoTheme.window.chromeHeight + windowEvent.imageHeight * p.width / windowEvent.imageWidth);
  expect(p.width).toBeLessThanOrEqual(width * (width / height >= 1.5 ? 0.44 : 0.8));
});

it.each(compositionPresets.filter(({ id }) => id !== "16x9"))("keeps the role badge above centered insets in $id", ({ width, height }) => {
  const layout = layoutFor(width, height, "macos");
  const top = roleBadgeTop(timeline, width, height, layout.top);
  expect(top + demoTheme.role.height + demoTheme.role.margin).toBeLessThanOrEqual(windowPlacement(windowEvent, width, height).top + 1e-6);
});
