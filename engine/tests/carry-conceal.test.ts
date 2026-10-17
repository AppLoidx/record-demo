import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { carryFlights, carryMotion, carryTiming, carryConcealOpacity } from "../lib/carry";
import { Carry, CarryConcealer } from "../remotion/Carry";
import { demoVideoSchema } from "../remotion/schema";
import { parseTimeline, serializeTimeline, type Timeline } from "../lib/timeline";
import { createTimeMap } from "../lib/time-map";
import { createSceneCameraPath } from "../lib/scene-camera";
import { carryCutLabTimeline } from "../remotion/Labs";

const source = { x: 100, y: 100, width: 400, height: 50 };
const target = { x: 800, y: 600, width: 360, height: 32 };
const subject: Timeline = { ...carryCutLabTimeline, events: [
  { t: 1700, kind: "carry", rect: source, text: "Message" },
  { t: 2000, kind: "transition", style: "cut", label: "", outMs: 0, cardMs: 3000, inMs: 540 },
  { t: 5540, kind: "land", rect: target },
] };

describe("carry destination concealment", () => {
  it("holds through the cut, then arcs directly to the destination without a dock", () => {
    const flight = carryFlights(subject)[0]!;
    const dock = { ...target, x: -9999 };
    for (let time = 2000; time <= 2540; time += 10)
      expect(carryMotion(flight, time, source, target, dock)).toMatchObject({ rect: source, scale: 1.04, opacity: 1 });
    const middle = carryMotion(flight, 2890, source, target, dock);
    expect(middle.rect.x).toBeGreaterThan(source.x);
    expect(middle.rect.x).toBeLessThan(target.x);
    expect(middle.rect.y).toBeLessThan((source.y + target.y) / 2);
    expect(carryMotion(flight, 3240, source, target, dock)).toMatchObject({ rect: target, scale: 1, opacity: 1 });
  });
  it.each([true, false])("conceals through approach then crossfades in sync (cut: %s)", (cut) => {
    const timeline: Timeline = { ...subject, events: subject.events.map((event) => event.kind === "transition" && !cut
      ? { ...event, style: undefined, outMs: 450, cardMs: 3000, visibleCardMs: 1200 } : event) };
    const flight = carryFlights(timeline)[0]!;
    const timing = carryTiming(flight);
    expect(timing.arrivalMs).toBe(Math.max(timing.sceneEndMs, flight.land.t) + 700);
    expect(carryConcealOpacity(flight, timing.incomingMs - 0.01)).toBe(0);
    for (let time = timing.incomingMs; time <= timing.arrivalMs; time += 5) {
      expect(carryConcealOpacity(flight, time)).toBe(1);
    }
    for (let time = timing.arrivalMs; time <= timing.revealEndMs; time += 5) {
      const chip = carryMotion(flight, time, source, target, target);
      const conceal = carryConcealOpacity(flight, time);
      expect(chip.rect).toEqual(target);
      expect(chip.opacity).toBeCloseTo(conceal, 10);
      expect(chip.opacity + (1 - conceal)).toBeCloseTo(1, 10);
    }
    expect(carryConcealOpacity(flight, timing.revealEndMs)).toBe(0);
  });
  it("uses opaque material, camera-local geometry, custom color and explicit opt-out", () => {
    const flight = carryFlights(subject)[0]!;
    const props = { flight, timeMs: 2200, deviceScaleFactor: 1.5, cameraScale: 0.8, frameScale: 1 };
    const html = renderToStaticMarkup(createElement(CarryConcealer, props));
    expect(html).toContain('data-carry-concealer="true"');
    expect(html).toContain("background:#FFFFFF");
    expect(html).toContain("opacity:1");
    expect(html).toContain("left:1197.5px;top:897.5px;width:545px;height:53px");
    expect(renderToStaticMarkup(createElement(CarryConcealer, { ...props,
      flight: { ...flight, land: { ...flight.land, concealColor: "#183A42" } } }))).toContain("background:#183A42");
    expect(renderToStaticMarkup(createElement(CarryConcealer, { ...props,
      flight: { ...flight, land: { ...flight.land, conceal: false } } }))).toBe("");
  });
  it("hands the chip material to the concealer at arrival, avoiding double alpha on real glyphs", () => {
    const flight = carryFlights(subject)[0]!;
    const props = { flight, timeline: subject, cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
      fps: 60, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } };
    const before = renderToStaticMarkup(createElement(Carry, { ...props, timeMs: carryTiming(flight).arrivalMs - 1 }));
    const during = renderToStaticMarkup(createElement(Carry, { ...props, timeMs: carryTiming(flight).arrivalMs + 125 }));
    expect(before).toContain("background:#EEE9FF");
    expect(during).toContain("background:transparent");
    expect(during).toMatch(/opacity:0\.5/);
  });
  it("waits for delayed land measurements before starting the full flight", () => {
    const flight = carryFlights(subject)[0]!;
    expect(carryTiming({ ...flight, land: { ...flight.land, t: 2690 } }).arrivalMs).toBe(3390);
    expect(carryTiming({ ...flight, land: { ...flight.land, t: 5000 } }).arrivalMs).toBe(5700);
  });
  it("stays aligned with the live concealer during a post-cut zoom before land", () => {
    const timeline: Timeline = { ...subject, durationMs: 9000, events: [
      ...subject.events.filter((e) => e.kind !== "land"),
      { t: 7190, kind: "zoom", durationMs: 1650, rect: { x: 650, y: 500, width: 700, height: 400 } },
      { t: 7190, kind: "land", rect: target, textStyle: { fontSize: 28, fontFamily: "Arial", fontWeight: "400", color: "black" } },
    ] };
    const flight = carryFlights(timeline)[0]!;
    const map = createTimeMap(timeline);
    const cameraPath = createSceneCameraPath(timeline, 60, 2560, 1440);
    const arrival = carryTiming(flight).arrivalMs;
    const future = cameraPath.atFrame(flight.targetTimeMs * 60 / 1000);
    for (const timeMs of [arrival, arrival + 50, arrival + 100, arrival + 150]) {
      const camera = cameraPath.atFrame(map.toTimelineTime(timeMs) * 60 / 1000);
      const scale = timeline.viewport.deviceScaleFactor * camera.scale;
      const html = renderToStaticMarkup(createElement(Carry, { flight, timeline, cameraPath, fps: 60,
        timeMs, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } }));
      const value = (property: string) => Number(html.match(new RegExp(`${property}:([0-9.e+-]+)px`))![1]);
      expect(value("left")).toBeCloseTo(camera.translateX + target.x * scale, 6);
      expect(value("top")).toBeCloseTo(camera.translateY + target.y * scale, 6);
      expect(value("width")).toBeCloseTo(target.width * scale, 6);
      expect(value("font-size")).toBeCloseTo(28 * scale, 6);
      expect(Math.abs(camera.translateX + target.x * scale - (future.translateX + target.x * timeline.viewport.deviceScaleFactor * future.scale))).toBeGreaterThan(5);
    }
  });
  it("round trips conceal options in both timeline validators", () => {
    const timeline: Timeline = { ...subject, events: subject.events.map((event) => event.kind === "land"
      ? { ...event, conceal: false, concealColor: "#183A42" } : event) };
    expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
    expect(demoVideoSchema.parse({ timeline, videoSrc: "test.mp4", windowChrome: "macos" }).timeline).toEqual(timeline);
  });
});
