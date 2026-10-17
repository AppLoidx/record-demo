import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Carry } from "../remotion/Carry";
import fixture from "../fixtures/timeline.json";
import { parseTimeline, serializeTimeline, type Timeline } from "../lib/timeline";
import { demoVideoSchema } from "../remotion/schema";
import { railState, railLayout, railScreenOffset } from "../lib/rail";
import { carryFlights, carryMotion, projectCarryRect } from "../lib/carry";
import { createTimeMap } from "../lib/time-map";
import { compositionPresets, demoTheme } from "../remotion/theme";
import { buildStudioTracks, layoutFor } from "../remotion/DemoVideo";

const steps = ["Bank asks", "Ops raises", "Customer answers", "Ops reviews", "Bank"];
const rect = { x: 700, y: 400, width: 360, height: 60 };
const timeline: Timeline = { ...fixture as Timeline, durationMs: 16000, events: [
  { t: 0, kind: "rail", steps, active: 0 },
  { t: 1000, kind: "rail", steps, active: 3 },
  { t: 2000, kind: "rail-back", from: 3, to: 2 },
  { t: 4500, kind: "rail-off" },
  { t: 6000, kind: "carry", rect, text: "Please describe the source of funds" },
  { t: 6300, kind: "transition", label: "Sent back to the customer", outMs: 450, cardMs: 4000, visibleCardMs: 1200, inMs: 560 },
  { t: 11310, kind: "land", rect: { ...rect, y: 600 } },
] };

describe("story overlay contracts", () => {
  it("round trips rail and carry events through both validators", () => {
    expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
    expect(demoVideoSchema.parse({ timeline, videoSrc: "clip.mp4", windowChrome: "none" }).timeline).toEqual(timeline);
  });
  it.each([
    { t: 0, kind: "rail", steps: [], active: 0 },
    { t: 0, kind: "rail", steps, active: 5 },
    { t: 0, kind: "rail", steps, active: 1.5 },
    { t: 0, kind: "rail-back", from: -1, to: 2 },
    { t: 0, kind: "carry", text: "Message", rect: { ...rect, width: -1 } },
    { t: 0, kind: "land", rect: { ...rect, x: NaN } },
  ])("rejects malformed new events in both schemas", (event) => {
    const value = { ...timeline, events: [event] };
    expect(() => parseTimeline(JSON.stringify(value))).toThrow();
    expect(demoVideoSchema.safeParse({ timeline: value, videoSrc: "clip.mp4", windowChrome: "none" }).success).toBe(false);
  });
});

describe("rail choreography", () => {
  it("slides the fill, draws the return first, lands and fades the arc", () => {
    expect(railState(timeline, 1000).layers[0]!.active).toBe(0);
    expect(railState(timeline, 1260).layers[0]!.active).toBeCloseTo(1.5);
    expect(railState(timeline, 1520).layers[0]!.active).toBe(3);
    expect(railState(timeline, 2450).layers[0]).toMatchObject({ active: 3, arc: { draw: 0.5 } });
    expect(railState(timeline, 2900).layers[0]).toMatchObject({ active: 3, arc: { draw: 1 } });
    expect(railState(timeline, 3420).layers[0]!.active).toBe(2);
    expect(railState(timeline, 3720).layers[0]!.arc?.opacity).toBe(0);
    expect(railState(timeline, 4860).opacity).toBe(0);
  });
  it("is continuous at phases, off, re-entry and interrupted advances", () => {
    const subject: Timeline = { ...timeline, events: [...timeline.events,
      { t: 1200, kind: "rail", steps, active: 4 },
      { t: 4600, kind: "rail", steps, active: 1 },
      { t: 5200, kind: "rail", steps: ["Customer", "Bank"], active: 1 },
    ] };
    for (const boundary of [0, 360, 1000, 1200, 1520, 1720, 2000, 2180, 2900, 3420, 3720, 4500, 4600, 4860, 4960, 5200, 5560]) {
      const a = railState(subject, boundary - 0.001), b = railState(subject, boundary + 0.001);
      expect(Math.abs(a.opacity - b.opacity)).toBeLessThan(0.0001);
      if (a.layers.length === 1 && b.layers.length === 1)
        expect(Math.abs(a.layers[0]!.active - b.layers[0]!.active)).toBeLessThan(0.001);
    }
  });
  it.each(compositionPresets)("reserves a stable top band in $id", ({ width, height }) => {
    const p = railLayout(steps, width, height);
    expect(p.left).toBeGreaterThan(0);
    expect(p.left + p.width).toBeLessThan(width);
    const base = layoutFor(width, height, "macos");
    const shift = railScreenOffset(timeline, width, height, base.top, 1);
    const gap = demoTheme.rail.screenGap * Math.min(1, Math.min(width, height) / 1440);
    expect(base.top + shift - p.top - p.height).toBeGreaterThanOrEqual(gap - 1e-6);
    expect(base.top + shift + base.screenHeight + base.chromeHeight).toBeLessThan(height);
    for (const opacity of [0, 0.1, 0.5, 0.9, 1]) {
      const screenTop = base.top + railScreenOffset(timeline, width, height, base.top, opacity);
      const pillBottom = p.top + p.height - shift * (1 - opacity);
      expect(screenTop - pillBottom).toBeGreaterThanOrEqual(gap - 1e-6);
    }
  });
});

it("exposes rail and carry spans on the composition clock in Studio", () => {
  const tracks = buildStudioTracks(timeline, 60, 792);
  expect(tracks.rails[0]).toMatchObject({ from: 0, name: "Rail: Bank asks" });
  expect(tracks.carries[0]).toMatchObject({ from: 360, durationInFrames: 162, name: "Carry: Please describe the source of funds" });
});

describe("message carry", () => {
  it("pairs by sequence and maps all phases through elastic card cuts", () => {
    const [flight] = carryFlights(timeline);
    expect(flight!.carry.t).toBe(6000);
    expect(flight!.transition.cardMs).toBe(1200);
    expect(flight!.land.t).toBe(8510);
    expect(flight!.land.t).toBe(createTimeMap(timeline).toCompositionTime(11310));
  });
  it("uses the endpoint camera plus DSF and screen origin", () => {
    expect(projectCarryRect(rect, 1.5, { scale: 0.5, translateX: -30, translateY: -20 }, { x: 100, y: 200 }))
      .toEqual({ x: 595, y: 480, width: 270, height: 45 });
  });
  it("lifts then glides directly through the chapter and crossfades at arrival", () => {
    const flight = carryFlights(timeline)[0]!;
    const source = rect, target = { ...rect, y: 600 }, dock = { ...rect, x: 900, y: 800 };
    const at = (time: number) => carryMotion(flight, time, source, target, dock);
    expect(at(6000)).toMatchObject({ rect: source, scale: 1, opacity: 0 });
    expect(at(6300).scale).toBe(1.04);
    expect(at(7500).rect.y).toBeGreaterThan(source.y);
    expect(at(7500).rect.y).toBeLessThan(target.y);
    expect(at(8510)).toMatchObject({ rect: target, scale: 1, opacity: 1 });
    expect(at(8690)).toMatchObject({ rect: target, scale: 1, opacity: 0 });
    expect(at(9110)).toMatchObject({ rect: target, scale: 1, opacity: 0 });
    for (const t of [6000, 6180, 6300, 6900, 7950, 8510, 8930, 9110]) {
      const a = at(t - 0.001), b = at(t + 0.001);
      expect(Math.abs(a.opacity - b.opacity)).toBeLessThan(0.0001);
      expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.0001);
      for (const key of ["x", "y", "width", "height"] as const)
        expect(Math.abs(a.rect[key] - b.rect[key])).toBeLessThan(0.001);
    }
  });
});

it("fades an existing return arc when a second return interrupts it", () => {
  const subject: Timeline = { ...timeline, events: [...timeline.events, { t: 2500, kind: "rail-back", from: 3, to: 1 }] };
  const before = railState(subject, 2500 - 0.001).layers[0]!;
  const after = railState(subject, 2500 + 0.001).layers[0]!;
  expect(after.trails?.[0]?.draw).toBeCloseTo(before.arc!.draw, 4);
  expect(after.trails?.[0]?.opacity).toBeCloseTo(before.arc!.opacity, 4);
  expect(after.arc!.opacity).toBeLessThan(0.001);
  expect(railState(subject, 2860).layers[0]!.trails?.[0]?.opacity ?? 0).toBe(0);
});

it("uses an opaque carry material so UI glyphs cannot ghost through at rest", () => {
  const flight = carryFlights(timeline)[0]!;
  const html = renderToStaticMarkup(createElement(Carry, { flight, timeline,
    cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
    fps: 60, timeMs: 6300, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } }));
  expect(html).toContain("background:#FFFFFF");
});

it("finishes the rail entrance and label crossfade when a return starts during them", () => {
  const entering: Timeline = { ...timeline, events: [
    { t: 0, kind: "rail", steps, active: 3 }, { t: 100, kind: "rail-back", from: 3, to: 2 },
  ] };
  expect(railState(entering, 360).opacity).toBe(1);
  const replacing: Timeline = { ...entering, events: [
    ...entering.events,
    { t: 2000, kind: "rail", steps: ["Bank", "Customer", "Ops"], active: 2 },
    { t: 2100, kind: "rail-back", from: 2, to: 1 },
  ] };
  expect(railState(replacing, 2360).layers).toHaveLength(1);
  expect(railState(replacing, 2360).layers[0]!.steps).toEqual(["Bank", "Customer", "Ops"]);
  expect(railState(replacing, 4000).opacity).toBe(1);
});

it.each([0, 200, 1200, 4000])("maps carry endpoints through prior cuts and a %sms visible card", (visibleCardMs) => {
  const subject: Timeline = { ...timeline, events: [
    { t: 1000, kind: "transition", label: "Earlier scene", outMs: 200, cardMs: 2000, visibleCardMs: 500, inMs: 300 },
    ...timeline.events.map((event) => event.kind === "transition" ? { ...event, visibleCardMs } : event),
  ] };
  const map = createTimeMap(subject), flight = carryFlights(subject)[0]!;
  expect(flight.carry.t).toBe(map.toCompositionTime(6000));
  expect(flight.land.t).toBe(map.toCompositionTime(11310));
  expect(flight.sourceTimeMs).toBe(6000);
  expect(flight.targetTimeMs).toBe(11310);
  expect(flight.transition.cardMs).toBe(visibleCardMs);
  const at = (time: number) => carryMotion(flight, time, rect, { ...rect, y: 600 }, { ...rect, y: 800 });
  for (const t of [flight.carry.t, flight.transition.t, flight.land.t, flight.land.t + 420, flight.land.t + 600]) {
    const before = at(t - 0.001), after = at(t + 0.001);
    expect(Math.abs(before.opacity - after.opacity)).toBeLessThan(0.0001);
    expect(Math.abs(before.rect.y - after.rect.y)).toBeLessThan(0.001);
  }
});

it("resolves identical overlay frames in any seek order without mutating the timeline", () => {
  const snapshot = JSON.stringify(timeline);
  const forward = [0, 100, 1260, 2450, 3100, 4500, 4800].map((time) => railState(timeline, time));
  const reverse = [4800, 4500, 3100, 2450, 1260, 100, 0].map((time) => railState(timeline, time)).reverse();
  expect(reverse).toEqual(forward);
  expect(JSON.stringify(timeline)).toBe(snapshot);
});

it("finishes a same-timestamp advance during the return arc before sliding back", () => {
  const subject: Timeline = { ...timeline, events: [
    { t: 0, kind: "rail", steps, active: 0 },
    { t: 1000, kind: "rail", steps, active: 3 },
    { t: 1000, kind: "rail-back", from: 3, to: 2 },
  ] };
  expect(railState(subject, 1260).layers[0]!.active).toBeCloseTo(1.5);
  expect(railState(subject, 1520).layers[0]!.active).toBe(3);
  expect(railState(subject, 1900).layers[0]!.active).toBe(3);
  expect(railState(subject, 2160).layers[0]!.active).toBeCloseTo(2.5);
  expect(railState(subject, 2420).layers[0]!.active).toBe(2);
});

it("uses 26px rail labels in landscape and moves the frame continuously at on/off", () => {
  const p = railLayout(steps, 2560, 1440);
  expect(demoTheme.rail.fontSize * p.scale).toBeCloseTo(26);
  const base = layoutFor(2560, 1440, "macos");
  const at = (time: number) => railScreenOffset(timeline, 2560, 1440, base.top, railState(timeline, time).opacity);
  expect(at(-1)).toBe(0);
  expect(at(360)).toBeGreaterThan(0);
  expect(at(4860)).toBe(0);
  for (const boundary of [0, 360, 4500, 4860]) {
    expect(Math.abs(at(boundary - 0.001) - at(boundary + 0.001))).toBeLessThan(0.001);
  }
});

it("anchors carry endpoints to their capture-time screen origins when rail headroom moves", () => {
  const flight = carryFlights(timeline)[0]!;
  const render = (timeMs: number) => renderToStaticMarkup(createElement(Carry, { flight, timeline,
    cameraPath: { moves: [], atFrame: () => ({ scale: 1 / 1.5, translateX: 0, translateY: 0 }) },
    fps: 60, timeMs, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 },
    screenOriginAt: (time: number) => time <= 6000 ? { x: 111, y: 222 } : { x: 333, y: 444 },
  }));
  expect(render(6300)).toContain("left:811px;top:622px");
  expect(render(8510)).toContain("left:1033px;top:1044px");
});
